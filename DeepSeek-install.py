#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""DeepSeek Harness universal installer.

Installs DeepSeek Harness (`dsh`) from source on Ubuntu / Debian / Arch /
Astra Linux / Windows and diagnoses common environment problems through the
built-in ``doctor`` command.

Design rules
------------
* Python 3.8+ standard library only (no pip dependencies).  Works with any
  system Python, so it can be bootstrapped before Node.js exists.
* One layout everywhere.  The repository is cloned into ``~/.dsh/source`` and
  dependency artifacts are installed inside it.  Nothing is written outside
  the user home and the checkout itself.
* Every system mutation is performed through the distro package manager and
  is limited to the packages ``dsh`` actually needs.  The script never runs
  ``curl | sh`` style installers and never touches package registries behind
  the user's back.
* The doctor reports problems, and with ``--fix`` repairs the ones it can
  repair automatically.  Anything that needs a decision is reported with an
  exact command to run, never guessed.

Exit codes
----------
0  success (or no problems found by doctor)
1  installation or doctor failure after all automatic repair attempts
2  usage error (unknown command / bad flags)
"""

from __future__ import annotations

import json
import os
import platform
import re
import shutil
import subprocess
import sys
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from pathlib import Path
from typing import List, Optional, Tuple

__version__ = "1.2.1"

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

#: Node.js engine floor of the repository (package.json "engines.node").
NODE_MIN = (22, 19, 0)
#: npm floor on Astra Linux: the distro ships an npm older than the one the
#: project toolchain needs.  Node.js 22 bundles npm 10, so the official
#: NodeSource distribution is required whenever the distro npm is older.
ASTRA_NPM_MIN = (10, 0, 0)
#: pnpm version fallback for the bootstrap stage, used only when no checkout
#: exists yet (doctor before install).  Once a checkout is present the
#: repository's own package.json "packageManager" pin wins (``_repo_pnpm_pin``).
PNPM_VERSION = "11.7.0"
#: Default source repository (the Russian-localization fork).
DEFAULT_REPO = "https://github.com/maksim9510/DeepSeek-Harnes.git"
#: Branch the fork publishes its synchronized work on.  The fork's checkout
#: layout keeps 'origin' on upstream, whose branch is named differently, so an
#: update cannot rely on the local branch's own tracking configuration.
FORK_BRANCH = "main"
#: Directory that receives the checkout, relative to the user home.
SOURCE_DIR_NAME = ".dsh/source"
#: Build record written by a complete `pnpm run build` (see scripts/build.ts).
CLIENT_BUILD_RECORD = ".dsh-build/client-build-environment.json"

#: Fork-local web search shim: its source inside the checkout, the modules
#: deployed to the Harness home, the systemd user unit that keeps it running,
#: and the port `web-search-deepseek.baseURL` must target.
SHIM_SOURCE_DIR = "tools/dsh-search-shim"
SHIM_DIR = ".dsh/search-shim"
SHIM_MODULES = ("server.mjs", "provider-route.mjs")
SHIM_UNIT_NAME = "dsh-search-shim.service"
SHIM_PORT = 24881
#: The shim uses global `fetch`, so it needs Node.js 18 even though the
#: repository itself has a higher floor.
SHIM_NODE_MIN = (18, 0, 0)

#: Astra Linux is Debian-based but ships an old npm; the official Node.js
#: distribution must be used there instead of the distro package.
ASTRA_OS_RELEASE = "/etc/astra_version"

ENV_FILE = ".env"
WEB_PORT = 3080


# ---------------------------------------------------------------------------
# Small helpers
# ---------------------------------------------------------------------------

def log(msg: str) -> None:
    print(msg)


def log_step(msg: str) -> None:
    print(f"\n==> {msg}")


def log_ok(msg: str) -> None:
    print(f"  [OK] {msg}")


def log_warn(msg: str) -> None:
    print(f"  [WARN] {msg}")


def log_fail(msg: str) -> None:
    print(f"  [FAIL] {msg}")


def run(
    args: List[str],
    *,
    check: bool = False,
    capture: bool = False,
    env: Optional[dict] = None,
    cwd: Optional[str] = None,
) -> subprocess.CompletedProcess:
    """Run one command; return the CompletedProcess.

    With ``capture`` the output is captured instead of streamed.  On Windows
    the window is kept hidden (CREATE_NO_WINDOW) so no console flashes open.
    ``cwd`` overrides the working directory of the child process.
    """
    kwargs: dict = {}
    if capture:
        kwargs["stdout"] = subprocess.PIPE
        kwargs["stderr"] = subprocess.STDOUT
        kwargs["text"] = True
        kwargs["encoding"] = "utf-8"
        kwargs["errors"] = "replace"
    if os.name == "nt":
        kwargs["creationflags"] = getattr(subprocess, "CREATE_NO_WINDOW", 0)
    if cwd is not None:
        kwargs["cwd"] = cwd
    merged_env = dict(os.environ)
    if env:
        merged_env.update(env)
    return subprocess.run(args, check=check, env=merged_env, **kwargs)


def run_capture(args: List[str], env: Optional[dict] = None) -> Tuple[int, str]:
    proc = run(args, capture=True, env=env)
    return proc.returncode, proc.stdout or ""


def require_command(name: str) -> Optional[str]:
    path = shutil.which(name)
    if not path:
        log_fail(f"Command not found: {name}")
    return path


def path_exists(path: Path) -> bool:
    return path.exists()


def has_command(name: str) -> bool:
    return shutil.which(name) is not None


def format_version_tuple(version: Tuple[int, int, int]) -> str:
    return ".".join(str(part) for part in version)


def parse_version(text: str) -> Optional[Tuple[int, int, int]]:
    """Parse a leading ``X.Y.Z`` (or ``X.Y``) version out of arbitrary text."""
    match = re.search(r"(\d+)\.(\d+)(?:\.(\d+))?", text or "")
    if not match:
        return None
    return (
        int(match.group(1)),
        int(match.group(2)),
        int(match.group(3) or 0),
    )


def version_at_least(version: Optional[Tuple[int, int, int]], minimum: Tuple[int, int, int]) -> bool:
    if version is None:
        return False
    return version >= minimum


_REPO_PIN_RE = re.compile(r'"packageManager":\s*"pnpm@(\d+\.\d+(?:\.\d+)?)')


def _repo_pnpm_pin(source_dir: Path) -> Optional[str]:
    """The pnpm version the checkout pins via package.json ``packageManager``.

    Returns None when no checkout exists or the field is absent, so callers
    fall back to the ``PNPM_VERSION`` constant for the bootstrap stage.
    """
    package = source_dir / "package.json"
    if not path_exists(package):
        return None
    try:
        text = package.read_text(encoding="utf-8")
    except OSError:
        return None
    match = _REPO_PIN_RE.search(text)
    return match.group(1) if match else None


def _yaml_top_keys(path: Path) -> set:
    """Top-level mapping keys of a YAML file, without a YAML dependency.

    Top-level keys are non-indented lines ending in ``:`` (or ``: ``).
    Comments, blank lines, document markers, and nested content are skipped.
    Values on the same line (``key: value``) count too; only a key whose line
    is indented or whose ``:`` opens a nested block is not top-level.
    """
    keys: set = set()
    try:
        for line in path.read_text(encoding="utf-8").splitlines():
            stripped = line.strip()
            if not stripped or stripped.startswith(("#", "%", "---", "...")):
                continue
            if line[:1].isspace():
                continue  # indented: nested under a top-level key
            if stripped.endswith(":") or ": " in stripped or ":" in stripped.split(" #")[0]:
                key = stripped.split(":", 1)[0].strip()
                if key:
                    keys.add(key)
    except OSError:
        pass
    return keys


# ---------------------------------------------------------------------------
# Platform detection
# ---------------------------------------------------------------------------

@dataclass
class Platform:
    """Detected operating system with the commands used to manage packages."""

    os: str                       # "linux" | "windows" | "macos" | "unknown"
    distro: str                   # e.g. "ubuntu", "debian", "arch", "astra", "unknown"
    distro_id: str
    version: str
    is_astra: bool = False
    pkg_install: List[str] = field(default_factory=list)   # package manager + install flag
    pkg_query: List[str] = field(default_factory=list)     # package manager + query flag
    core_pkgs: List[str] = field(default_factory=list)     # distro packages required at runtime
    node_install_hint: str = ""

    @property
    def is_linux(self) -> bool:
        return self.os == "linux"

    @property
    def is_windows(self) -> bool:
        return self.os == "windows"


def _read_os_release() -> dict:
    data: dict = {}
    try:
        text = Path("/etc/os-release").read_text(encoding="utf-8")
        for line in text.splitlines():
            if "=" in line:
                key, _, value = line.partition("=")
                data[key.strip()] = value.strip().strip('"')
    except OSError:
        pass
    return data


def _detect_distro(os_release: dict) -> str:
    if path_exists(Path(ASTRA_OS_RELEASE)):
        return "astra"
    distro_id = os_release.get("ID", "").lower()
    if distro_id:
        if distro_id in ("ubuntu", "debian", "astra"):
            return distro_id
        if distro_id in ("arch", "manjaro", "endeavouros", "cachyos", "arcolinux"):
            return "arch"
    # Fall back to /etc/issue.
    try:
        issue = Path("/etc/issue").read_text(encoding="utf-8", errors="replace").lower()
        if "astra" in issue or "astra linux" in issue:
            return "astra"
        if "ubuntu" in issue:
            return "ubuntu"
        if "debian" in issue:
            return "debian"
        if "arch" in issue:
            return "arch"
    except OSError:
        pass
    return "unknown"


def detect_platform() -> Platform:
    system = platform.system().lower()
    if system == "windows":
        return Platform(
            os="windows",
            distro="windows",
            distro_id="windows",
            version=platform.release(),
            is_astra=False,
            pkg_install=["winget", "install", "--accept-source-agreements", "--accept-package-agreements"],
            pkg_query=["winget", "list"],
            core_pkgs=["Git.Git", "OpenJS.NodeJS.LTS"],
            node_install_hint="winget install --id OpenJS.NodeJS.LTS -e --source winget",
        )
    if system != "linux":
        return Platform(
            os="unknown",
            distro="unknown",
            distro_id="unknown",
            version=platform.release(),
            node_install_hint="Install Node.js 22.19+ from https://nodejs.org and add it to PATH.",
        )

    os_release = _read_os_release()
    distro = _detect_distro(os_release)
    version = os_release.get("VERSION_ID", platform.release())
    is_astra = distro == "astra"

    if distro in ("ubuntu", "debian"):
        pkg = Platform(
            os="linux",
            distro=distro,
            distro_id=os_release.get("ID", distro),
            version=version,
            is_astra=False,
            pkg_install=["apt-get", "install", "-y"],
            pkg_query=["dpkg", "-s"],
            core_pkgs=["git", "curl", "ca-certificates", "build-essential"],
            node_install_hint=(
                "Install Node.js 22.19+ from the official NodeSource setup for your release: "
                "https://github.com/nodesource/distributions"
            ),
        )
        # Debian/Ubuntu also need the `nodejs` distro package when the
        # official distribution is not used; the doctor checks the version.
        pkg.core_pkgs.append("nodejs")
        return pkg

    if distro == "arch":
        return Platform(
            os="linux",
            distro="arch",
            distro_id=os_release.get("ID", "arch"),
            version=version,
            is_astra=False,
            pkg_install=["pacman", "-S", "--noconfirm"],
            pkg_query=["pacman", "-Q"],
            core_pkgs=["git", "curl", "base-devel", "nodejs", "npm"],
            node_install_hint="pacman -S nodejs npm",
        )

    if is_astra:
        return Platform(
            os="linux",
            distro="astra",
            distro_id=os_release.get("ID", "astra"),
            version=version,
            is_astra=True,
            pkg_install=["apt-get", "install", "-y"],
            pkg_query=["dpkg", "-s"],
            core_pkgs=["git", "curl", "ca-certificates", "build-essential"],
            node_install_hint=(
                "Astra Linux ships an old npm, so install Node.js from the official "
                "NodeSource distribution instead of the distro package: "
                "https://github.com/nodesource/distributions"
            ),
        )

    return Platform(
        os="linux",
        distro="unknown",
        distro_id=os_release.get("ID", "unknown"),
        version=version,
        node_install_hint="Install Node.js 22.19+ from https://nodejs.org and add it to PATH.",
    )


# ---------------------------------------------------------------------------
# Doctor
# ---------------------------------------------------------------------------

@dataclass
class CheckResult:
    """Outcome of one doctor check."""

    name: str
    ok: bool
    detail: str = ""
    fix: Optional[str] = None      # command the user can run to fix it
    auto_fixed: bool = False
    probe: Optional[callable] = None  # re-runs the check after an auto-fix


class Doctor:
    """Probe the environment and repair what can be repaired automatically."""

    def __init__(self, platform_info: Platform, source_dir: Path, fix: bool,
                 fix_names: Optional[frozenset] = None):
        self.platform = platform_info
        self.source_dir = source_dir
        self.fix = fix
        #: The pnpm version to target: the checkout's own pin when one exists,
        #: else the bootstrap fallback constant.
        self.pnpm_pin = _repo_pnpm_pin(source_dir) or PNPM_VERSION
        #: None lets every automatic fix run; a set restricts auto-repair to
        #: the named checks (install bootstraps only the pnpm toolchain).
        self.fix_names = fix_names
        self.results: List[CheckResult] = []
        self.auto_fixes_applied = 0

    # -- probes ------------------------------------------------------------

    def _node_version(self) -> Optional[Tuple[int, int, int]]:
        if not has_command("node"):
            return None
        code, out = run_capture(["node", "--version"])
        return parse_version(out) if code == 0 else None

    def _npm_version(self) -> Optional[Tuple[int, int, int]]:
        if not has_command("npm"):
            return None
        code, out = run_capture(["npm", "--version"])
        return parse_version(out) if code == 0 else None

    def _pnpm_version(self) -> Optional[Tuple[int, int, int]]:
        if not has_command("pnpm"):
            return None
        code, out = run_capture(["pnpm", "--version"])
        return parse_version(out) if code == 0 else None

    def _corepack_pnpm(self) -> Optional[str]:
        """Return the version Corepack would activate for the pinned pnpm.

        Runs ``corepack pnpm@<pin> --version`` explicitly so the answer does
        not depend on a checkout being present; ``corepack prepare`` already
        cached the pinned version when pnpm was first resolved.
        """
        if not has_command("corepack"):
            return None
        code, out = run_capture(["corepack", f"pnpm@{self.pnpm_pin}", "--version"])
        if code == 0:
            return out.strip()
        # Fall back to an unqualified resolve, which honors the current
        # directory's packageManager field.
        code, out = run_capture(["corepack", "pnpm", "--version"])
        if code == 0:
            return out.strip()
        return None

    def _git_version(self) -> Optional[Tuple[int, int, int]]:
        if not has_command("git"):
            return None
        code, out = run_capture(["git", "--version"])
        return parse_version(out) if code == 0 else None

    # -- checks ------------------------------------------------------------

    def check_python(self) -> CheckResult:
        version = platform.python_version_tuple()
        major, minor = int(version[0]), int(version[1])
        ok = major == 3 and minor >= 8
        return CheckResult(
            "python3",
            ok,
            detail=f"Python {platform.python_version()}",
            fix="Install Python 3.8+ (python3) for this operating system.",
        )

    def check_node(self) -> CheckResult:
        version = self._node_version()
        ok = version_at_least(version, NODE_MIN)
        detail = (
            f"Node.js {format_version_tuple(version)}"
            if version
            else "Node.js not found"
        )
        if not ok:
            return CheckResult(
                "nodejs",
                False,
                detail=detail,
                fix=self.platform.node_install_hint
                or f"Install Node.js {format_version_tuple(NODE_MIN)}+ and add it to PATH.",
            )
        return CheckResult("nodejs", True, detail=detail)

    def check_npm(self) -> CheckResult:
        """npm must simply exist; the build is driven by pnpm, not npm.

        The distro-npm-too-old case is a platform property, checked separately
        by ``check_astra_npm`` where the distro actually ships an old npm.
        """
        version = self._npm_version()
        if version is None:
            return CheckResult(
                "npm",
                False,
                detail="npm not found",
                fix="Reinstall Node.js: it ships npm. On Astra Linux use the official NodeSource distribution.",
            )
        return CheckResult("npm", True, detail=f"npm {format_version_tuple(version)}")

    def check_pnpm(self) -> CheckResult:
        """The effective pnpm is the one Corepack resolves.

        The repository pins ``packageManager: pnpm@<pin>``, so a bare global
        ``pnpm`` shim can be older than the pinned version while Corepack
        still resolves the right one.  The check therefore prefers
        ``corepack pnpm --version`` and falls back to the global shim.
        """
        version_text = self._corepack_pnpm()
        source = "corepack"
        if version_text is None:
            version = self._pnpm_version()
            source = "global pnpm"
        else:
            version = parse_version(version_text)
        if version is None:
            return CheckResult(
                "pnpm",
                False,
                detail="pnpm not resolvable (global shim or corepack)",
                fix=(
                    f"Enable Corepack and prepare pnpm: "
                    f"`corepack enable && corepack prepare pnpm@{self.pnpm_pin} --activate`."
                ),
                probe=self.check_pnpm,
            )
        pinned = tuple(int(part) for part in self.pnpm_pin.split("."))
        # Exactly the pin: a newer pnpm refuses to switch under Corepack and
        # fails the build's nested pnpm calls, an older one rewrites the
        # lockfile without the workspace overrides.
        ok = version == pinned
        note = ""
        if self.pnpm_pin != PNPM_VERSION:
            note = f" (repo pin; the installer constant is still {PNPM_VERSION})"
        sudo_hint = (
            " If `corepack enable` fails with EACCES on a root-owned bin "
            "directory, run `sudo corepack enable` once, then re-run doctor."
        )
        return CheckResult(
            "pnpm",
            ok,
            detail=f"pnpm {format_version_tuple(version)} via {source} (target pin {self.pnpm_pin}){note}",
            fix=(
                f"Install and activate the pinned pnpm: "
                f"`corepack enable && corepack prepare pnpm@{self.pnpm_pin} --activate`.{sudo_hint}"
            ),
            probe=self.check_pnpm,
        )

    def check_pnpm_shim(self) -> CheckResult:
        """The bare ``pnpm`` a user types must be safe to run.

        A standalone pnpm whose version differs from the pin breaks the
        project in both directions: older than 10 it does not read the
        workspace ``overrides`` and silently rewrites ``pnpm-lock.yaml``;
        newer it refuses to switch to the pinned version when a parent
        process already invoked pnpm through Corepack (the nested
        ``pnpm --filter …`` calls in `pnpm run build` fail with the
        version-mismatch error).  The check passes when the bare pnpm
        already is a Corepack shim or a standalone pnpm matching the pin
        exactly; a missing bare pnpm is created, and any other standalone
        pnpm is repointed at Corepack.
        """
        path = shutil.which("pnpm")
        if path is None:
            if has_command("corepack"):
                corepack_dir = os.path.dirname(shutil.which("corepack") or "corepack")
                return CheckResult(
                    "pnpm-shim",
                    False,
                    detail="no bare pnpm on PATH although Corepack is available",
                    fix=(
                        f"Create the pnpm shim: `corepack enable pnpm` (shims land next to corepack "
                        f"in {corepack_dir}; prefix with sudo when the directory is root-owned)."
                    ),
                    probe=self.check_pnpm_shim,
                )
            return CheckResult(
                "pnpm-shim",
                True,
                detail="no pnpm and no corepack on PATH (the corepack check owns the bootstrap)",
            )
        if "corepack" in os.path.realpath(path):
            return CheckResult("pnpm-shim", True, detail=f"bare pnpm is a Corepack shim ({path})")
        version = self._pnpm_version()
        pinned = tuple(int(part) for part in self.pnpm_pin.split("."))
        if version == pinned:
            return CheckResult("pnpm-shim", True, detail=f"standalone pnpm {format_version_tuple(version)} matches the pin exactly")
        version_text = format_version_tuple(version) if version else "unknown"
        return CheckResult(
            "pnpm-shim",
            False,
            detail=(
                f"standalone pnpm {version_text} at {path} differs from the pinned {self.pnpm_pin}: "
                "older-than-10 rewrites pnpm-lock.yaml without the workspace overrides; newer refuses to "
                "switch under Corepack and fails the nested pnpm calls in the build"
            ),
            fix=(
                f"Point the shim at Corepack: `corepack enable pnpm --install-directory {os.path.dirname(path)}` "
                "(prefix with sudo when the directory is root-owned)."
            ),
            probe=self.check_pnpm_shim,
        )

    def check_corepack(self) -> CheckResult:
        """Corepack provides the pinned pnpm; npm can install it when absent."""
        if has_command("corepack"):
            return CheckResult("corepack", True, detail="corepack available")
        if has_command("npm"):
            return CheckResult(
                "corepack",
                False,
                detail="corepack not found (it normally ships with Node.js)",
                fix="Install Corepack: `npm install -g corepack`.",
                probe=self.check_corepack,
            )
        return CheckResult(
            "corepack",
            False,
            detail="corepack not found and npm is not available",
            fix="Reinstall Node.js from the official distribution; corepack ships with it.",
        )

    def check_git(self) -> CheckResult:
        version = self._git_version()
        ok = version_at_least(version, (2, 26, 0))
        detail = f"git {format_version_tuple(version)}" if version else "git not found"
        if not ok:
            return CheckResult(
                "git",
                False,
                detail=detail,
                fix=(
                    f"Install git 2.26+: {self.platform.pkg_install[0]} install git"
                    if self.platform.pkg_install
                    else "Install git 2.26+."
                ),
            )
        return CheckResult("git", True, detail=detail)

    def check_distro_packages(self) -> CheckResult:
        if self.platform.is_windows:
            # winget package IDs are not command names; map each ID to the
            # binary it provides to avoid false "missing" reports.
            binary_of = {
                "Git.Git": "git",
                "OpenJS.NodeJS.LTS": "node",
            }
            missing = [
                pkg for pkg in self.platform.core_pkgs
                if not has_command(binary_of.get(pkg, pkg))
            ]
            if missing:
                return CheckResult(
                    "packages",
                    False,
                    detail="Missing: " + ", ".join(missing),
                    fix=" ".join(self.platform.pkg_install + missing),
                    probe=self.check_distro_packages,
                )
            return CheckResult("packages", True, detail="winget packages present")
        if not self.platform.pkg_install:
            return CheckResult("packages", True, detail="no package manager checks for this distro")
        missing = []
        for pkg in self.platform.core_pkgs:
            query = self.platform.pkg_query + [pkg]
            code, _ = run_capture(query)
            if code != 0:
                missing.append(pkg)
        if missing:
            return CheckResult(
                "packages",
                False,
                detail="Missing distro packages: " + ", ".join(missing),
                fix=" ".join(self.platform.pkg_install + missing),
                probe=self.check_distro_packages,
            )
        return CheckResult("packages", True, detail="distro packages present")

    def check_source_dir(self) -> CheckResult:
        if path_exists(self.source_dir):
            return CheckResult("source", True, detail=f"checkout exists: {self.source_dir}")
        return CheckResult(
            "source",
            False,
            detail=f"no checkout at {self.source_dir}",
            fix=f"Run the installer (this script) to clone the repository into {self.source_dir}.",
        )

    def check_node_modules(self) -> CheckResult:
        nm = self.source_dir / "node_modules"
        if path_exists(nm):
            return CheckResult("deps", True, detail="node_modules present")
        return CheckResult(
            "deps",
            False,
            detail="node_modules missing — dependencies not installed",
            fix=f"cd {self.source_dir} && pnpm install",
        )

    def check_build_record(self) -> CheckResult:
        stale = _build_artifacts_missing_or_stale(self.source_dir) if path_exists(self.source_dir) else "no checkout"
        if stale is None:
            return CheckResult("build", True, detail="artifacts built from the current commit")
        return CheckResult(
            "build",
            False,
            detail=f"artifacts not built for this commit: {stale}",
            fix=f"cd {self.source_dir} && pnpm run build",
        )

    def check_env_key(self) -> CheckResult:
        """A missing API key never blocks install; it only limits the Web UI."""
        env_file = self.source_dir / ENV_FILE
        if not path_exists(env_file):
            return CheckResult(
                "env",
                True,
                detail="no .env yet — add DEEPSEEK_API_KEY=sk-... later to use the assistant",
            )
        try:
            text = env_file.read_text(encoding="utf-8")
        except OSError as exc:
            return CheckResult("env", True, detail=f"cannot read .env: {exc} (non-blocking)")
        if "DEEPSEEK_API_KEY" in text and "sk-" in text:
            return CheckResult("env", True, detail="DEEPSEEK_API_KEY present in .env")
        return CheckResult(
            "env",
            True,
            detail=".env exists but DEEPSEEK_API_KEY looks unset (non-blocking)",
        )

    def check_network(self) -> CheckResult:
        if not has_command("curl"):
            return CheckResult("network", True, detail="curl not available, skipping reachability check")
        code, _ = run_capture(["curl", "-fsSI", "--max-time", "8", "https://registry.npmjs.org/"])
        if code == 0:
            return CheckResult("network", True, detail="registry.npmjs.org reachable")
        return CheckResult(
            "network",
            False,
            detail="cannot reach registry.npmjs.org (proxy/firewall?)",
            fix="Configure HTTPS_PROXY / HTTP_PROXY for the current shell and re-run doctor.",
        )

    def check_astra_npm(self) -> CheckResult:
        """Astra Linux ships an npm older than the one Node.js 22 bundles.

        The check is a plain version comparison against the npm baseline
        (``ASTRA_NPM_MIN``): when the distro npm is too old, the official
        NodeSource Node.js distribution must replace it.  The comparison uses
        the npm versioning scheme, never the Node.js engine floor.
        """
        if not self.platform.is_astra:
            return CheckResult("astra-npm", True, detail="not Astra Linux")
        npm_version = self._npm_version()
        if npm_version is None:
            return CheckResult(
                "astra-npm",
                False,
                detail="npm not found on Astra Linux",
                fix="Install Node.js from the official NodeSource distribution.",
            )
        if version_at_least(npm_version, ASTRA_NPM_MIN):
            return CheckResult("astra-npm", True, detail=f"npm {format_version_tuple(npm_version)} is new enough")
        return CheckResult(
            "astra-npm",
            False,
            detail=f"distro npm {format_version_tuple(npm_version)} is older than npm {format_version_tuple(ASTRA_NPM_MIN)} (the floor bundled with Node.js 22)",
            fix=(
                "Replace the distro Node.js with the official NodeSource distribution: "
                "https://github.com/nodesource/distributions (Node.js 22.x), "
                "then re-run doctor."
            ),
        )

    def check_search_shim(self) -> CheckResult:
        """Report whether the fork's web search shim is deployed and running.

        The shim answers the `web-search-deepseek` provider, so a checkout
        that carries it but never deployed it leaves the Web UI without web
        search.  A checkout without the shim at all is not a defect.
        """
        source = self.source_dir / SHIM_SOURCE_DIR
        if not source.is_dir():
            return CheckResult("search-shim", True, detail="no shim in this checkout — check skipped")
        target_dir = _shim_target_dir()
        absent = [name for name in SHIM_MODULES if not path_exists(target_dir / name)]
        if absent:
            return CheckResult(
                "search-shim",
                False,
                detail=f"the shim is not deployed ({', '.join(absent)} missing from {target_dir})",
                fix="python3 DeepSeek-install.py doctor --fix",
                probe=self.check_search_shim,
            )
        node = _shim_node()
        if node is None:
            return CheckResult(
                "search-shim",
                False,
                detail=f"Node.js >= {format_version_tuple(SHIM_NODE_MIN)} is needed to run the shim",
                fix="install a supported Node.js, then re-run doctor",
            )
        if not _systemd_user_available():
            problem = _shim_health()
            if problem is None:
                return CheckResult("search-shim", True, detail=f"running on port {SHIM_PORT} without a systemd user manager")
            return CheckResult(
                "search-shim",
                False,
                detail=problem,
                fix=f"run: DSH_SEARCH_SHIM_PORT={SHIM_PORT} {node} {target_dir / 'server.mjs'}",
            )
        unit = _shim_unit_path()
        if not path_exists(unit):
            return CheckResult(
                "search-shim",
                False,
                detail=f"the unit is not registered ({unit} missing)",
                fix="python3 DeepSeek-install.py doctor --fix",
                probe=self.check_search_shim,
            )
        code, out = run_capture(["systemctl", "--user", "is-active", SHIM_UNIT_NAME])
        state = out.strip()
        if code != 0 or state != "active":
            return CheckResult(
                "search-shim",
                False,
                detail=f"unit {SHIM_UNIT_NAME} is {state or 'not running'}",
                fix=f"python3 DeepSeek-install.py doctor --fix",
                probe=self.check_search_shim,
            )
        problem = _shim_health()
        if problem is not None:
            return CheckResult(
                "search-shim",
                False,
                detail=problem,
                fix=f"journalctl --user -u {SHIM_UNIT_NAME} -n 40",
            )
        return CheckResult("search-shim", True, detail=f"running on port {SHIM_PORT} with the active unit")

    def check_lockfile(self) -> CheckResult:
        """Detect a pnpm frozen-lockfile mismatch in the checkout.

        pnpm 9+ stores ``overrides`` and ``patchedDependencies`` in the
        lockfile root.  When ``pnpm-workspace.yaml`` declares them but the
        lockfile does not (or vice versa), ``pnpm install`` aborts with
        ``ERR_PNPM_LOCKFILE_CONFIG_MISMATCH`` before installing anything.
        The check compares only the presence of the two top-level sections,
        which is exactly what the frozen install validates.
        """
        workspace = self.source_dir / "pnpm-workspace.yaml"
        lockfile = self.source_dir / "pnpm-lock.yaml"
        if not path_exists(workspace) or not path_exists(lockfile):
            return CheckResult(
                "lockfile",
                True,
                detail="no checkout — lockfile check skipped",
            )
        ws_keys = _yaml_top_keys(workspace)
        lock_keys = _yaml_top_keys(lockfile)
        ws_sections = [k for k in ("overrides", "patchedDependencies") if k in ws_keys]
        lock_sections = [k for k in ("overrides", "patchedDependencies") if k in lock_keys]
        if ws_sections == lock_sections:
            return CheckResult("lockfile", True, detail="lockfile sections match pnpm-workspace.yaml")
        return CheckResult(
            "lockfile",
            False,
            detail=(
                "pnpm frozen install would fail: pnpm-workspace.yaml declares "
                f"{ws_sections or 'none'} but the lockfile stores {lock_sections or 'none'}"
            ),
            fix=(
                f"Regenerate the lockfile: cd {self.source_dir} && "
                "corepack pnpm install --no-frozen-lockfile --lockfile-only"
            ),
            probe=self.check_lockfile,
        )

    # -- runner ------------------------------------------------------------

    def run_all(self) -> List[CheckResult]:
        checks = [
            self.check_python(),
            self.check_node(),
            self.check_npm(),
            self.check_corepack(),
            self.check_pnpm(),
            self.check_pnpm_shim(),
            self.check_git(),
            self.check_distro_packages(),
            self.check_astra_npm(),
            self.check_source_dir(),
            self.check_node_modules(),
            self.check_build_record(),
            self.check_lockfile(),
            self.check_search_shim(),
            self.check_env_key(),
            self.check_network(),
        ]
        for result in checks:
            self._maybe_fix(result)
            self.results.append(result)
        return self.results

    def _maybe_fix(self, result: CheckResult) -> None:
        """Apply an automatic repair when the check failed, `--fix` is on,
        and the fix is a command this script may run itself."""
        if result.ok or not self.fix or not result.fix:
            return
        if self.fix_names is not None and result.name not in self.fix_names:
            return
        if not self._is_automatic(result):
            log_warn(f"Not auto-fixing {result.name}; run manually:")
            log_warn(f"  {result.fix}")
            return
        log_step(f"Doctor: auto-fixing {result.name}")
        if self._apply_fix(result):
            # Re-probe to confirm the repair actually landed; only a passing
            # re-check marks the result as repaired.
            fresh = result.probe() if result.probe else None
            if fresh is not None and fresh.ok:
                result.ok = True
                result.detail = fresh.detail
                result.auto_fixed = True
                self.auto_fixes_applied += 1
                log_ok(f"{result.name} repaired")
            else:
                log_fail(f"{result.name} fix applied but re-check still fails")
        else:
            log_fail(f"auto-fix for {result.name} failed")

    def _is_automatic(self, result: CheckResult) -> bool:
        """Whether the check's fix is safe to run without a decision.

        Installing distro packages via the package manager is automatic only
        with --fix and only on Linux; on Windows winget installs are automatic
        too.  `corepack enable` is safe and non-interactive.
        """
        if result.name == "corepack":
            # Installing corepack through the existing npm is automatic; a
            # missing npm means reinstalling Node.js, which needs a decision.
            return has_command("npm")
        if result.name in ("python3", "nodejs", "npm", "git", "astra-npm", "network", "source", "deps", "build", "env"):
            return False   # each needs a decision, a reinstall, or user action
        if result.name == "pnpm":
            return True    # corepack enable + prepare is automatic
        if result.name == "pnpm-shim":
            return True    # repointing the shim at corepack is automatic; EACCES is reported with the sudo command
        if result.name == "lockfile":
            return True    # lockfile regeneration inside the checkout
        if result.name == "search-shim":
            return True    # redeploying the shim from the checkout is automatic
        if result.name == "packages":
            return not result.auto_fixed  # distro package install
        return False

    def _apply_fix(self, result: CheckResult) -> bool:
        try:
            if result.name == "corepack":
                return self._fix_corepack()
            if result.name == "pnpm":
                return self._fix_pnpm()
            if result.name == "pnpm-shim":
                return self._fix_pnpm_shim()
            if result.name == "lockfile":
                return self._fix_lockfile()
            if result.name == "search-shim":
                _deploy_shim(self.source_dir)
                return True
            if result.name == "packages":
                return self._fix_packages()
        except (OSError, subprocess.SubprocessError) as exc:
            log_fail(f"auto-fix failed: {exc}")
            return False
        return False

    def _fix_pnpm_shim(self) -> bool:
        """Create or repoint the bare ``pnpm`` shim at Corepack.

        An existing shim is replaced in the directory it lives in, so the
        command users already type keeps resolving; a missing shim is
        created next to the corepack binary.  A root-owned directory makes
        the unprivileged attempt fail with EACCES; the exact sudo command
        is then printed and the fix reports failure so the re-probe does
        not mark the shim repaired.
        """
        if not has_command("corepack"):
            return False
        env = {"COREPACK_ENABLE_DOWNLOAD_PROMPT": "0"}
        path = shutil.which("pnpm")
        if path is None:
            code, out = run_capture(["corepack", "enable", "pnpm"], env=env)
            if code != 0:
                log_fail(f"corepack enable pnpm failed: {out.strip()[:160]}")
                log_warn("  Run with sudo: sudo corepack enable pnpm")
                return False
            return True
        target_dir = os.path.dirname(path)
        code, out = run_capture(
            ["corepack", "enable", "pnpm", "--install-directory", target_dir], env=env
        )
        if code != 0:
            log_fail(f"corepack enable pnpm failed: {out.strip()[:160]}")
            log_warn(f"  Run with sudo: sudo corepack enable pnpm --install-directory {target_dir}")
            return False
        return True

    def _fix_corepack(self) -> bool:
        """Install Corepack through the existing npm.

        Corepack normally ships with Node.js; when it is absent but npm is
        available, the global npm install restores it without touching
        Node itself.
        """
        code, out = run_capture(["npm", "install", "-g", "corepack"])
        if code != 0:
            log_fail(f"npm install -g corepack failed: {out.strip()[:160]}")
            return False
        return has_command("corepack")

    def _fix_pnpm(self) -> bool:
        """Download and activate the pinned pnpm through Corepack.

        ``corepack enable`` creates global shims and can fail with EACCES on
        a root-owned bin directory; that is not fatal — the pinned pnpm is
        still activated by ``corepack prepare --activate``, which downloads
        the pinned version and makes it the Corepack default.  Only the
        prepare step is therefore required for a successful repair.
        """
        return _prepare_pnpm(self.pnpm_pin)

    def _fix_lockfile(self) -> bool:
        """Regenerate the lockfile so it matches pnpm-workspace.yaml."""
        if not path_exists(self.source_dir / "pnpm-lock.yaml"):
            return False
        return _regenerate_lockfile(self.source_dir)

    def _fix_packages(self) -> bool:
        if not self.platform.pkg_install:
            return False
        missing = []
        for pkg in self.platform.core_pkgs:
            query = self.platform.pkg_query + [pkg]
            code, _ = run_capture(query)
            if code != 0:
                missing.append(pkg)
        if not missing:
            return True
        log(f"Installing distro packages: {' '.join(missing)}")
        proc = run(self.platform.pkg_install + missing)
        return proc.returncode == 0


# ---------------------------------------------------------------------------
# Installer
# ---------------------------------------------------------------------------

def _prepare_pnpm(pin: str) -> bool:
    """Download and activate pnpm@<pin> through Corepack.

    ``corepack enable`` creates global shims and can fail with EACCES on a
    root-owned bin directory; that is not fatal — the pinned pnpm is still
    activated by ``corepack prepare --activate``.  Returns True when the
    pinned version is resolvable afterwards.
    """
    env = {"COREPACK_ENABLE_DOWNLOAD_PROMPT": "0"}
    if has_command("corepack"):
        code, out = run_capture(["corepack", "enable"], env=env)
        if code != 0:
            log_warn(f"corepack enable skipped ({out.strip()[:120]}…); continuing with prepare --activate")
    code, out = run_capture(
        ["corepack", "prepare", f"pnpm@{pin}", "--activate"], env=env
    )
    if code != 0:
        log_fail(f"corepack prepare pnpm@{pin} failed: {out.strip()}")
        return False
    return True


#: 'github.com/owner/repo' inside an https or ssh remote URL.
_REPO_ID_RE = re.compile(r"github\.com[/:]([^/]+)/([^/\s]+?)(?:\.git)?$")


def _repo_id(url: str) -> Optional[Tuple[str, str]]:
    """Lowercase (owner, repo) of a github.com remote URL, or None.

    A non-GitHub or malformed URL has no identity to compare, and the caller
    treats it as not serving the requested repository.
    """
    match = _REPO_ID_RE.search(url)
    if not match:
        return None
    return match.group(1).lower(), match.group(2).lower()


def _git_capture(source_dir: Path, args: List[str]) -> Tuple[int, str]:
    """Run one git command against source_dir and capture its output."""
    return run_capture(["git", "-C", str(source_dir), *args])


def _remote_serving(source_dir: Path, wanted: Optional[Tuple[str, str]]) -> Optional[str]:
    """Name of the remote that serves wanted, preferring origin.

    The fork's synchronized layout has 'origin' on upstream and 'personal' on
    the fork, so the remote to update from is found by identity rather than by
    name.
    """
    if wanted is None:
        return None
    code, out = _git_capture(source_dir, ["remote"])
    if code != 0:
        return None
    for name in sorted(out.split(), key=lambda entry: entry != "origin"):
        code, url = _git_capture(source_dir, ["remote", "get-url", name])
        if code == 0 and _repo_id(url.strip()) == wanted:
            return name
    return None


def _current_branch(source_dir: Path) -> Optional[str]:
    """Short name of the checked-out branch, or None on a detached HEAD."""
    code, out = _git_capture(source_dir, ["rev-parse", "--abbrev-ref", "HEAD"])
    name = out.strip()
    return name if code == 0 and name not in ("", "HEAD") else None


def _remote_head_branch(source_dir: Path, remote: str) -> Optional[str]:
    """Branch the remote's own HEAD points at, when its ref is recorded."""
    code, out = _git_capture(source_dir, ["symbolic-ref", "--short", f"refs/remotes/{remote}/HEAD"])
    ref = out.strip()
    if code != 0 or "/" not in ref:
        return None
    return ref.split("/", 1)[1]


def _update_ref(source_dir: Path, remote: str) -> Optional[str]:
    """The remote/branch ref an existing checkout should advance to.

    The fork's published branch wins; a remote with no such branch falls back
    to its own HEAD, then to the branch the checkout already has.
    """
    candidates = [FORK_BRANCH, _remote_head_branch(source_dir, remote), _current_branch(source_dir)]
    for branch in candidates:
        if not branch:
            continue
        ref = f"{remote}/{branch}"
        code, _ = _git_capture(source_dir, ["rev-parse", "--verify", "--quiet", ref])
        if code == 0:
            return ref
    return None


def _update_existing_repo(repo: str, source_dir: Path) -> bool:
    """Fast-forward an existing checkout onto the requested repository.

    The update never reads the local branch's tracking configuration: in the
    fork's layout that configuration points the local branch at origin/main,
    while origin is upstream and publishes master, so a plain 'git pull
    --ff-only' fails with a missing ref.  Updating from the remote that
    actually serves repo is correct in both layouts.
    """
    remote = _remote_serving(source_dir, _repo_id(repo))
    if remote is None:
        log_step(f"Repository already present at {source_dir}; pulling latest")
        proc = run(["git", "-C", str(source_dir), "pull", "--ff-only"])
        return proc.returncode == 0

    log_step(f"Repository already present at {source_dir}; updating from '{remote}'")
    code, out = _git_capture(source_dir, ["fetch", remote])
    if code != 0:
        log_fail(f"git fetch {remote} failed:\n{out.strip()}")
        return False

    ref = _update_ref(source_dir, remote)
    if ref is None:
        log_fail(f"no branch to update from '{remote}'; check the remote by hand: git remote -v")
        return False

    code, before = _git_capture(source_dir, ["rev-parse", "HEAD"])
    code, out = _git_capture(source_dir, ["merge", "--ff-only", ref])
    if code != 0:
        log_fail(f"Cannot fast-forward onto {ref}:\n{out.strip()}")
        log_warn("The checkout carries commits that the remote does not, so it needs a deliberate merge:")
        log(f"    cd {source_dir} && git status && git log --oneline {ref}..HEAD")
        return False
    code, after = _git_capture(source_dir, ["rev-parse", "HEAD"])
    if before.strip() == after.strip():
        log_ok(f"Already up to date with {ref}")
    else:
        log_ok(f"Updated to {after.strip()[:10]} from {ref}")
    return True


def _ensure_git_repo(repo: str, source_dir: Path) -> bool:
    """Clone the repository into source_dir, or update an existing checkout."""
    if not has_command("git"):
        log_fail("git is required; run doctor first.")
        return False
    source_dir.parent.mkdir(parents=True, exist_ok=True)
    if path_exists(source_dir / ".git"):
        return _update_existing_repo(repo, source_dir)
    log_step(f"Cloning {repo} into {source_dir}")
    proc = run(["git", "clone", repo, str(source_dir)])
    return proc.returncode == 0


def _pnpm_command() -> List[str]:
    """Command prefix that resolves the pinned pnpm.

    Prefer the Corepack-resolved pnpm so an old global shim never breaks the
    build; fall back to a bare ``pnpm`` when Corepack is unavailable.
    """
    if has_command("corepack"):
        return ["corepack", "pnpm"]
    return ["pnpm"]


def _lockfile_mismatch(source_dir: Path) -> bool:
    """True when pnpm's frozen install would abort on a config mismatch.

    Mirrors ``Doctor.check_lockfile``: the workspace declares ``overrides``
    or ``patchedDependencies`` that the lockfile does not store (or vice
    versa), which pnpm rejects with ``ERR_PNPM_LOCKFILE_CONFIG_MISMATCH``.
    """
    workspace = source_dir / "pnpm-workspace.yaml"
    lockfile = source_dir / "pnpm-lock.yaml"
    if not path_exists(workspace) or not path_exists(lockfile):
        return False
    ws_keys = _yaml_top_keys(workspace)
    lock_keys = _yaml_top_keys(lockfile)
    sections = ("overrides", "patchedDependencies")
    return [k for k in sections if k in ws_keys] != [k for k in sections if k in lock_keys]


def _regenerate_lockfile(source_dir: Path) -> bool:
    """Rewrite the lockfile to match pnpm-workspace.yaml; retried once."""
    log_step("Lockfile is out of sync with pnpm-workspace.yaml; regenerating it")
    attempts = 0
    while attempts < 2:
        proc = run(
            _pnpm_command() + ["install", "--no-frozen-lockfile", "--lockfile-only"],
            env={"COREPACK_ENABLE_DOWNLOAD_PROMPT": "0"},
            cwd=str(source_dir),
        )
        if proc.returncode == 0:
            return True
        attempts += 1
        log_warn(f"lockfile regeneration attempt {attempts} failed (exit {proc.returncode}); retrying once")
    return False


def _install_dependencies(source_dir: Path, platform_info: Platform) -> bool:
    """Run pnpm install in the checkout.

    The install runs non-interactively: ``CI=true`` suppresses pnpm's
    interactive purge confirmation when it replaces an existing node_modules.
    A frozen-lockfile config mismatch is repaired first by regenerating the
    lockfile, then the install retries.
    """
    if _lockfile_mismatch(source_dir):
        if not _regenerate_lockfile(source_dir):
            return False
    log_step("Installing dependencies with pnpm (this can take a while)")
    env = {
        "COREPACK_ENABLE_DOWNLOAD_PROMPT": "0",
        "CI": "true",
    }
    proc = run(
        _pnpm_command() + ["install"],
        env=env,
        cwd=str(source_dir),
    )
    if proc.returncode != 0 and _lockfile_mismatch(source_dir):
        # The mismatch can appear after a pull updated the workspace config;
        # repair and retry once.
        if not _regenerate_lockfile(source_dir):
            return False
        proc = run(
            _pnpm_command() + ["install"],
            env=env,
            cwd=str(source_dir),
        )
    return proc.returncode == 0


def _recorded_commit(source_dir: Path) -> Optional[str]:
    """Short commit recorded by the last complete build, or None when unusable.

    The record is written by ``pnpm run build`` (scripts/client-build-environment.ts)
    and carries the source commit its artifacts were built from.
    """
    try:
        record = json.loads((source_dir / CLIENT_BUILD_RECORD).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    environment = record.get("environment") if isinstance(record, dict) else None
    if not isinstance(environment, dict):
        return None
    value = environment.get("DSH_CLIENT_COMMIT_HASH")
    return value if isinstance(value, str) and value else None


def _build_artifacts_missing_or_stale(source_dir: Path) -> Optional[str]:
    """Reason the artifacts cannot be reused, or None when the build may be skipped.

    Presence alone is not enough: the checkout is fast-forwarded onto a newer
    commit before the build step, so a record left by an earlier build would
    otherwise let stale artifacts pass as current.
    """
    if not path_exists(source_dir / CLIENT_BUILD_RECORD):
        return "no build record"
    recorded = _recorded_commit(source_dir)
    if recorded is None:
        return f"{CLIENT_BUILD_RECORD} is unreadable or carries no commit"
    code, head = _git_capture(source_dir, ["rev-parse", "HEAD"])
    if code != 0:
        return "cannot resolve the checkout commit"
    head = head.strip()
    if not head.startswith(recorded):
        return f"artifacts were built from {recorded}, checkout is at {head[:7]}"
    return None


def _build(source_dir: Path) -> bool:
    """Run the repository build; skip only when current artifacts are present."""
    stale = _build_artifacts_missing_or_stale(source_dir)
    if stale is None:
        log_ok("Build artifacts already present for this commit; skipping build")
        return True
    log_step(f"Building DeepSeek Harness ({stale})")
    proc = run(
        _pnpm_command() + ["run", "build"],
        env={"COREPACK_ENABLE_DOWNLOAD_PROMPT": "0"},
        cwd=str(source_dir),
    )
    return proc.returncode == 0


def _create_env_file(source_dir: Path) -> None:
    env_file = source_dir / ENV_FILE
    if path_exists(env_file):
        return
    log_step(f"Creating {env_file} (add your DEEPSEEK_API_KEY later)")
    env_file.write_text("# DeepSeek Harness environment\n# Add your API key below to use the assistant.\nDEEPSEEK_API_KEY=\n", encoding="utf-8")


def _shim_target_dir() -> Path:
    """Deployment directory for the shim inside the Harness home."""
    return Path.home() / SHIM_DIR


def _shim_unit_path() -> Path:
    """Path of the shim's systemd user unit file."""
    return Path.home() / ".config" / "systemd" / "user" / SHIM_UNIT_NAME


def _systemd_user_available() -> bool:
    """Whether a systemd user manager is reachable on this host."""
    if not has_command("systemctl"):
        return False
    return Path("/run/systemd/system").is_dir()


def _shim_node() -> Optional[str]:
    """Absolute `node` path for the unit's ExecStart, or None when unusable.

    The unit runs without the interactive shell's PATH, so a bare `node`
    would resolve only by accident; the absolute path is what makes the unit
    start on a machine whose Node.js came from nvm or a manual install.
    """
    node = shutil.which("node")
    if node is None:
        return None
    code, out = run_capture([node, "--version"])
    if code != 0:
        return None
    version = parse_version(out)
    return node if version_at_least(version, SHIM_NODE_MIN) else None


def _shim_health(port: int = SHIM_PORT) -> Optional[str]:
    """Return None when the shim's health endpoint answers, else the problem."""
    try:
        with urllib.request.urlopen(f"http://127.0.0.1:{port}/health", timeout=10) as response:
            if response.status == 200:
                return None
            return f"health endpoint answered HTTP {response.status}"
    except (urllib.error.URLError, OSError) as exc:
        return f"health endpoint unreachable: {exc}"


def _wait_for_shim_health(port: int = SHIM_PORT, timeout: float = 15.0) -> Optional[str]:
    """Poll the health endpoint until it answers or `timeout` elapses.

    A restart answers only once Node has bound the port, which takes a moment;
    probing once immediately after `systemctl restart` reports a healthy unit
    as unreachable.
    """
    import time

    deadline = time.monotonic() + timeout
    problem = _shim_health(port)
    while problem is not None and time.monotonic() < deadline:
        time.sleep(0.5)
        problem = _shim_health(port)
    return problem


def _render_shim_unit(node: str, target_dir: Path, port: int) -> str:
    """Render the shim's systemd user unit for one deployment."""
    return (
        "[Unit]\n"
        "Description=DSH web search shim (local Anthropic-compatible "
        "web_search_20250305 endpoint)\n"
        "After=network-online.target\n"
        "Wants=network-online.target\n"
        "\n"
        "[Service]\n"
        "Type=simple\n"
        f"ExecStart={node} {target_dir / 'server.mjs'}\n"
        f"Environment=DSH_SEARCH_SHIM_PORT={port}\n"
        "Restart=on-failure\n"
        "RestartSec=2\n"
        "\n"
        "[Install]\n"
        "WantedBy=default.target\n"
    )


def _deploy_shim(source_dir: Path) -> None:
    """Deploy the shim and register its unit; report problems without failing.

    A checkout without the shim is valid (the sync protects the shim, but a
    pre-shim clone or an upstream rewind may lack it), and the Web UI works
    without it, so this step never aborts an installation.
    """
    source = source_dir / SHIM_SOURCE_DIR
    if not source.is_dir():
        log_warn(f"No search shim in the checkout ({source}); skipping.")
        return
    missing = [name for name in SHIM_MODULES if not (source / name).is_file()]
    if missing:
        log_warn(f"Search shim source is incomplete, missing: {', '.join(missing)}")
        return

    target_dir = _shim_target_dir()
    target_dir.mkdir(parents=True, exist_ok=True)
    for name in SHIM_MODULES:
        shutil.copyfile(source / name, target_dir / name)
    log_ok(f"Search shim deployed to {target_dir}")

    if not _systemd_user_available():
        log_warn("No systemd user manager; the shim is deployed but not started.")
        log(f"    run it with: DSH_SEARCH_SHIM_PORT={SHIM_PORT} {shutil.which('node') or 'node'} {target_dir / 'server.mjs'}")
        return

    node = _shim_node()
    if node is None:
        log_warn(f"Node.js >= {format_version_tuple(SHIM_NODE_MIN)} is needed to run the shim; unit not written.")
        return

    unit = _shim_unit_path()
    unit.parent.mkdir(parents=True, exist_ok=True)
    unit.write_text(_render_shim_unit(node, target_dir, SHIM_PORT), encoding="utf-8")
    run(["systemctl", "--user", "daemon-reload"])
    run(["systemctl", "--user", "enable", "--now", SHIM_UNIT_NAME])
    run(["systemctl", "--user", "restart", SHIM_UNIT_NAME])

    problem = _wait_for_shim_health()
    if problem is None:
        log_ok(f"Search shim running on port {SHIM_PORT}")
    else:
        log_warn(f"Search shim unit did not become healthy: {problem}")
        log(f"    inspect: journalctl --user -u {SHIM_UNIT_NAME} -n 40")


def _write_windows_launcher(source_dir: Path) -> Optional[Path]:
    """Create a dsh.cmd launcher for Windows (no-op elsewhere)."""
    if os.name != "nt":
        return None
    launcher = source_dir / "dsh.cmd"
    launcher.write_text(
        "@echo off\r\n"
        'set "COREPACK_ENABLE_DOWNLOAD_PROMPT=0"\r\n'
        f'cd /d "{source_dir}"\r\n'
        "call pnpm dsh %*\r\n",
        encoding="utf-8",
    )
    return launcher


def install(repo: str, source_dir: Path, platform_info: Platform, skip_build: bool) -> bool:
    log_step("DeepSeek Harness installer")
    log(f"  Platform: {platform_info.os} / {platform_info.distro} {platform_info.version}")

    # Prerequisite gate: only environment checks block; source/deps/build are
    # exactly what install creates, and the API key is optional.  The pnpm
    # toolchain is bootstrapped right here — corepack through npm, the pinned
    # pnpm through corepack prepare, the bare pnpm shim through corepack
    # enable — so a fresh machine ends the install with a working pnpm.
    doctor = Doctor(
        platform_info, source_dir, fix=True,
        fix_names=frozenset({"corepack", "pnpm", "pnpm-shim", "search-shim"}),
    )
    doctor.run_all()
    blocking = [
        r for r in doctor.results
        if not r.ok and r.name in (
            "python3", "nodejs", "npm", "corepack", "pnpm", "pnpm-shim",
            "git", "packages", "astra-npm", "network",
        )
    ]
    for result in doctor.results:
        if not result.ok:
            status = "BLOCK" if result.name in (r.name for r in blocking) else "note "
            log(f"  [{status}] {result.name}: {result.detail}")
    if blocking:
        log_fail("Prerequisites missing; fix them first (run `python3 DeepSeek-install.py doctor --fix`).")
        for result in blocking:
            if result.fix:
                log_warn(f"  {result.name}: {result.fix}")
        return False

    if not _ensure_git_repo(repo, source_dir):
        return False
    repo_pin = _repo_pnpm_pin(source_dir)
    if repo_pin and repo_pin != PNPM_VERSION:
        log_step(f"Чек-аут закрепляет pnpm@{repo_pin}; активирую закреплённую версию")
        _prepare_pnpm(repo_pin)
    if not _install_dependencies(source_dir, platform_info):
        return False
    if not skip_build and not _build(source_dir):
        return False
    _create_env_file(source_dir)
    _deploy_shim(source_dir)
    launcher = _write_windows_launcher(source_dir)
    log_step("Installation complete")
    if launcher:
        log(f"  Windows launcher: {launcher}")
    log(f"  Checkout: {source_dir}")
    log("  Run the Web UI with:")
    log(f"    cd {source_dir} && pnpm dsh web")
    log("  Doctor is available any time with:")
    log("    python3 DeepSeek-install.py doctor [--fix]")
    return True


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def _print_help() -> None:
    print(
        f"""DeepSeek Harness installer (version {__version__})

USAGE
    python3 DeepSeek-install.py <command> [options]

The install also deploys the fork's web search shim (tools/dsh-search-shim)
into ~/.dsh/search-shim and registers its systemd user unit, so the Web UI
has working web search without a separate setup step.

COMMANDS
    install            Clone, install dependencies, build and prepare the
                       DeepSeek Harness checkout in {SOURCE_DIR_NAME}.
    doctor             Probe the environment for problems and, with --fix,
                       repair the ones that are safe to fix automatically.
    help               Show this help.

OPTIONS
    --repo URL         Repository to clone (default: {DEFAULT_REPO}).
    --dir PATH         Install directory (default: ~/{SOURCE_DIR_NAME}).
    --skip-build       Do not run `pnpm run build` during install.
    --fix              Doctor: automatically apply safe repairs.
    --json             Doctor: print results as JSON.

EXAMPLES
    python3 DeepSeek-install.py install
    python3 DeepSeek-install.py doctor
    python3 DeepSeek-install.py doctor --fix
    python3 DeepSeek-install.py doctor --json
"""
    )


def _parse_args(argv: List[str]):
    command = argv[0] if argv else "help"
    repo = DEFAULT_REPO
    source_dir = Path.home() / SOURCE_DIR_NAME
    skip_build = False
    fix = False
    as_json = False
    rest = argv[1:]
    i = 0
    while i < len(rest):
        arg = rest[i]
        if arg == "--repo" and i + 1 < len(rest):
            repo = rest[i + 1]
            i += 2
            continue
        if arg == "--dir" and i + 1 < len(rest):
            source_dir = Path(rest[i + 1]).expanduser()
            i += 2
            continue
        if arg == "--skip-build":
            skip_build = True
        elif arg == "--fix":
            fix = True
        elif arg == "--json":
            as_json = True
        else:
            print(f"Unknown option: {arg}", file=sys.stderr)
            print("Run `python3 DeepSeek-install.py help` for usage.", file=sys.stderr)
            return None
        i += 1
    return {
        "command": command,
        "repo": repo,
        "source_dir": source_dir,
        "skip_build": skip_build,
        "fix": fix,
        "json": as_json,
    }


def _doctor_report(doctor: Doctor, as_json: bool) -> int:
    if as_json:
        payload = [
            {
                "name": r.name,
                "ok": r.ok,
                "detail": r.detail,
                "fix": r.fix,
                "auto_fixed": r.auto_fixed,
            }
            for r in doctor.results
        ]
        print(json.dumps(payload, ensure_ascii=False, indent=2))
        return 0 if all(r.ok for r in doctor.results) else 1

    print("\nDeepSeek Harness doctor report")
    print("=" * 60)
    for result in doctor.results:
        status = "OK  " if result.ok else "FAIL"
        marker = " [auto-fixed]" if result.auto_fixed else ""
        print(f"  [{status}] {result.name}: {result.detail}{marker}")
        if not result.ok and result.fix:
            print(f"           fix: {result.fix}")
    print("=" * 60)
    failed = [r for r in doctor.results if not r.ok]
    if failed:
        print(f"{len(failed)} problem(s) found.")
        print("Run `python3 DeepSeek-install.py doctor --fix` to apply safe repairs.")
        return 1
    print("All checks passed.")
    return 0


def main(argv: Optional[List[str]] = None) -> int:
    args = _parse_args(list(argv) if argv is not None else sys.argv[1:])
    if args is None:
        return 2

    command = args["command"]
    if command in ("help", "-h", "--help"):
        _print_help()
        return 0

    platform_info = detect_platform()
    source_dir = args["source_dir"]

    if command == "doctor":
        doctor = Doctor(platform_info, source_dir, fix=args["fix"])
        doctor.run_all()
        return _doctor_report(doctor, args["json"])

    if command == "install":
        ok = install(
            args["repo"],
            source_dir,
            platform_info,
            skip_build=args["skip_build"],
        )
        return 0 if ok else 1

    print(f"Unknown command: {command}", file=sys.stderr)
    print("Run `python3 DeepSeek-install.py help` for usage.", file=sys.stderr)
    return 2


if __name__ == "__main__":
    sys.exit(main())
