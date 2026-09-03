#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""DeepSeek Harness upstream synchronization script.

Synchronizes the fork repository with upstream
(https://github.com/deepseek-ai/deepseek-harness), automatically resolving
problems where safe and stopping with a human-action report when a problem
needs a decision.  Local customizations are protected: the sync never drops
or overwrites them.

Protected local work
--------------------
* Russian README (README.md as the default repository README)
* Russian web localization (packages/extensions/locale-ru, roster row in
  packages/bundle/web-app/cordis.patch.yml, tsconfig paths, package deps)
* The universal installer (DeepSeek-install.py and its docs)
* The lockfile fix that keeps pnpm install working
* The current-chat-model web search provider
  (packages/web/web-search-routerai, its composition row in
  packages/bundle/base/cordis.patch.yml, the base bundle dependency, and
  the tsconfig path registrations)

How the sync works
------------------
1. Verify the working tree is clean and the layout is the sync layout
   (local ``master``; ``origin`` = upstream; ``personal`` = the fork).
   A fresh ``git clone`` of the fork — one ``origin`` remote pointing at the
   fork, checked out on the fork's ``main``, no local ``master`` — is
   repaired in place automatically: ``master`` is created at the fork's
   ``main``, ``origin`` is repointed at upstream, and ``personal`` is added
   for the fork.  ``master`` is then fast-forwarded onto the fork's ``main``
   whenever the fork moved ahead on its own.  Anything else aborts.
2. ``git fetch origin`` (upstream) and ``git fetch personal`` (the fork).
3. If ``master`` already contains ``origin/master``, everything is synced;
   push ``master`` to the fork's ``main`` and exit 0.
4. Run the protected-marker audit: every marker below must exist in the
   working tree before the merge.  A missing marker is a human problem —
   the fork changed underneath the script.
5. Merge ``origin/master`` into ``master``.  On a clean merge, verify the
   markers again, refresh the lockfile when pnpm reports a frozen-install
   mismatch, install dependencies, and run the fast checks.  Commit the
   merge only when everything passes.
6. Push ``master`` to the fork's ``main``.
7. Any failure at a step that needs a decision stops the sync with exit 1
   and prints an exact recovery command; the merge, when it failed, is
   aborted so the tree stays clean.  The daily cron run reports the same
   text into its log.

Exit codes: 0 synced (or nothing to do), 1 needs human intervention,
2 usage error.
"""

from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import sys
from datetime import datetime
from pathlib import Path
from typing import List, Optional, Tuple

__version__ = "1.1.0"

UPSTREAM_REMOTE = "origin"
FORK_REMOTE = "personal"
UPSTREAM_BRANCH = "master"
LOCAL_BRANCH = "master"
FORK_MAIN_BRANCH = "main"

UPSTREAM_URL = "https://github.com/deepseek-ai/deepseek-harness.git"
#: (owner, repo) pairs in lowercase; GitHub repo ids are case-insensitive.
UPSTREAM_OWNER_REPO = ("deepseek-ai", "deepseek-harness")
FORK_OWNER_REPO = ("maksim9510", "deepseek-harnes")
#: SSH form used for the fork remote: the sync's own error texts assume an
#: SSH key, and the fork clone the self-heal handles arrives over https.
FORK_SSH_URL = "git@github.com:maksim9510/DeepSeek-Harnes.git"

#: Repository root, resolved from this script's location so the cron entry
#: does not depend on the caller's working directory.
REPO_ROOT = Path(__file__).resolve().parent

#: Human action report file, written only when the sync stops for a human.
HUMAN_REPORT = REPO_ROOT / "sync-needs-human.txt"

#: Log file for unattended (cron) runs.
SYNC_LOG = REPO_ROOT / "sync.log"

#: (file, substring) pairs that must exist for the protected work to count as
#: present.  Each entry names one shipped customization; losing any of them
#: means the fork no longer carries that customization.
PROTECTED_MARKERS: List[Tuple[str, str]] = [
    ("README.md", "Русская локализация"),
    ("README.md", "DeepSeek-install.py"),
    ("README.zh.md", "[English](README.md) | 中文"),
    ("DeepSeek-install.py", "def main("),
    ("packages/bundle/web-app/cordis.patch.yml", "locale-ru"),
    ("packages/bundle/web-app/package.json", "@deepseek-ai/dsh-client-locale-ru"),
    ("pnpm-workspace.yaml", "overrides:"),
    ("package.json", "pnpm@"),
    # The current-chat-model web search provider.  The provider package is
    # untracked until the fork commits it, so the marker audit keys on the
    # tracked registrations: the composition row, the base bundle dependency,
    # and the tsconfig paths.  A lost registration after a merge means the
    # fork silently fell back to upstream's search wiring.
    ("packages/bundle/base/cordis.patch.yml", "web-search-routerai"),
    ("packages/bundle/base/package.json", "@deepseek-ai/dsh-web-search-routerai"),
    ("tsconfig.base.json", "@deepseek-ai/dsh-web-search-routerai"),
    ("tsconfig.host.json", "packages/web/web-search-routerai"),
]

#: Locale dictionaries the ru language pack owns, relative to the ru package's
#: client/locales directory.  When upstream adds or removes keys in the owning
#: namespace, the sync realigns these dictionaries automatically (added keys
#: get a Russian translation from RU_TRANSLATIONS or fall back to the English
#: owner text; removed keys are dropped) and re-records the pairing sidecar.
RU_LOCALES_DIR = "packages/extensions/locale-ru/src/client/locales"

#: Russian translations for keys upstream may add, keyed by the full locale
#: key.  Keys missing here fall back to the upstream English text.
RU_TRANSLATIONS = {
    'chat.turnNavigation.jumpLoad': 'Загрузить и перейти к ходу {turn}',
    'queue.image': 'Изображение в очереди сообщений',
}


# ---------------------------------------------------------------------------
# Logging and subprocess helpers
# ---------------------------------------------------------------------------

def log(msg: str) -> None:
    print(msg, flush=True)


def log_step(msg: str) -> None:
    print(f"\n==> {msg}", flush=True)


def log_ok(msg: str) -> None:
    print(f"  [OK] {msg}", flush=True)


def log_warn(msg: str) -> None:
    print(f"  [WARN] {msg}", flush=True)


def log_fail(msg: str) -> None:
    print(f"  [FAIL] {msg}", flush=True)


def git(args: List[str], *, check: bool = False, capture: bool = False,
        cwd: Optional[str] = None) -> subprocess.CompletedProcess:
    return run(["git"] + args, check=check, capture=capture, cwd=cwd)


def run(args: List[str], *, check: bool = False, capture: bool = False,
        env: Optional[dict] = None, cwd: Optional[str] = None) -> subprocess.CompletedProcess:
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


def run_capture(args: List[str], env: Optional[dict] = None,
                cwd: Optional[str] = None) -> Tuple[int, str]:
    proc = run(args, capture=True, env=env, cwd=cwd)
    return proc.returncode, proc.stdout or ""


def has_command(name: str) -> bool:
    return shutil.which(name) is not None


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


def pinned_pnpm_version() -> Optional[Tuple[int, int, int]]:
    """pnpm version pinned by the repository's ``packageManager`` field."""
    try:
        text = (REPO_ROOT / "package.json").read_text(encoding="utf-8")
    except OSError:
        return None
    match = re.search(r'"packageManager":\s*"pnpm@(\d+)\.(\d+)(?:\.(\d+))?', text)
    if not match:
        return None
    return (
        int(match.group(1)),
        int(match.group(2)),
        int(match.group(3) or 0),
    )


# ---------------------------------------------------------------------------
# Human intervention report
# ---------------------------------------------------------------------------

def write_human_report(title: str, details: List[str]) -> None:
    """Persist the human-action report; the cron log and console echo it."""
    lines = [f"DeepSeek-sync: {title}", "=" * 60] + details + [
        "=" * 60,
        f"Время: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}",
        "После ручного исправления запустите: python3 DeepSeek-sync.py",
    ]
    HUMAN_REPORT.write_text("\n".join(lines) + "\n", encoding="utf-8")
    log_fail(title)
    for line in lines:
        log(f"  {line}")


# ---------------------------------------------------------------------------
# Protected-work verification
# ---------------------------------------------------------------------------

def check_protected_markers(phase: str) -> List[str]:
    """Return the list of lost protected markers (empty when all present)."""
    lost: List[str] = []
    for rel_path, marker in PROTECTED_MARKERS:
        path = REPO_ROOT / rel_path
        try:
            text = path.read_text(encoding="utf-8")
        except OSError:
            lost.append(f"{rel_path}: file missing")
            continue
        if marker not in text:
            lost.append(f"{rel_path}: marker not found: {marker!r}")
    # The provider package directory itself: its tracked registrations can
    # survive a merge while the untracked source tree disappears (a fresh
    # checkout of the fork would not carry it).  The package.json anchor
    # doubles as the marker for the whole untracked directory.
    provider_pkg = REPO_ROOT / "packages/web/web-search-routerai/package.json"
    if not provider_pkg.exists():
        lost.append("packages/web/web-search-routerai/: package directory missing")
    return lost


# ---------------------------------------------------------------------------
# pnpm / lockfile helpers (same contract as DeepSeek-install.py)
# ---------------------------------------------------------------------------

def _pnpm_command() -> List[str]:
    if has_command("corepack"):
        return ["corepack", "pnpm"]
    return ["pnpm"]


def _yaml_top_keys(path: Path) -> set:
    try:
        text = path.read_text(encoding="utf-8")
    except OSError:
        return set()
    return _yaml_top_keys_text(text)


def _yaml_top_keys_text(text: str) -> set:
    keys: set = set()
    for line in text.splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith(("#", "%", "---", "...")):
            continue
        if line[:1].isspace():
            continue
        if stripped.endswith(":") or ": " in stripped or ":" in stripped.split(" #")[0]:
            key = stripped.split(":", 1)[0].strip()
            if key:
                keys.add(key)
    return keys


def lockfile_mismatch() -> bool:
    """True when pnpm's frozen install would abort on a config mismatch."""
    workspace = REPO_ROOT / "pnpm-workspace.yaml"
    lockfile = REPO_ROOT / "pnpm-lock.yaml"
    if not workspace.exists() or not lockfile.exists():
        return False
    sections = ("overrides", "patchedDependencies")
    ws = _yaml_top_keys(workspace)
    lock = _yaml_top_keys(lockfile)
    return [k for k in sections if k in ws] != [k for k in sections if k in lock]


def regenerate_lockfile() -> bool:
    """Rewrite the lockfile to match pnpm-workspace.yaml; retried once."""
    log("Regenerating the lockfile")
    for attempt in (1, 2):
        code, _ = run_capture(
            ["corepack", "pnpm", "install", "--no-frozen-lockfile", "--lockfile-only"],
            env={"COREPACK_ENABLE_DOWNLOAD_PROMPT": "0"},
            cwd=str(REPO_ROOT),
        )
        if code == 0:
            return True
        log_warn(f"lockfile regeneration attempt {attempt} failed (exit {code})")
    return False


# ---------------------------------------------------------------------------
# Sync steps
# ---------------------------------------------------------------------------

def ensure_clean_tree() -> Optional[str]:
    """Return a problem description when the tree is not ready for a sync.

    Untracked files do not block a sync: the sync script itself is often
    untracked (freshly deployed), and a merge does not touch untracked
    paths.  Modified tracked files do block, because a merge would mix
    them into the merge commit.
    """
    code, out = run_capture(["git", "status", "--porcelain", "--untracked-files=no"])
    if code != 0:
        return f"git status failed: {out.strip()}"
    if out.strip():
        return (
            "В рабочем дереве есть незакоммиченные изменения затреканных файлов:"
            f"\n{out.strip()}\n"
            "  Команда: git status  →  git add <files> && git commit"
        )
    branch = run_capture(["git", "rev-parse", "--abbrev-ref", "HEAD"])[1].strip()
    if branch != LOCAL_BRANCH:
        return f"Синхронизация идёт только из ветки {LOCAL_BRANCH}, сейчас: {branch}"
    return None


def git_remote_url(name: str) -> Optional[str]:
    """Return a remote's URL, or None when the remote does not exist."""
    code, out = run_capture(["git", "remote", "get-url", name])
    return out.strip() if code == 0 else None


def _remote_repo_id(url: str) -> Optional[Tuple[str, str]]:
    """Lowercase (owner, repo) of a github.com remote URL.

    Accepts ``https://github.com/owner/repo``, ``https://owner:token@github.com/
    owner/repo``, and ``git@github.com:owner/repo``; returns None for a
    non-GitHub URL or a malformed one.
    """
    match = re.search(r"(?:github\.com[/:])([^/]+)/([^/\s]+?)(?:\.git)?$", url)
    if not match:
        return None
    return match.group(1).lower(), match.group(2).lower()


def ensure_fork_is_origin() -> Optional[str]:
    """Return a problem, or None after fixing the sync layout in place.

    The canonical sync layout is ``origin`` = upstream and ``personal`` =
    the fork.  A fresh ``git clone`` of the fork arrives with only one
    remote, ``origin``, pointing at the fork, and checked out on the fork's
    ``main``.  When the checkout is exactly that shape, the layout is
    repaired in place: the local ``master`` branch is created at the fork's
    ``main``, ``origin`` is repointed at upstream, ``personal`` is added for
    the fork, and the sync continues from there.  Any other layout — an
    ``origin`` that is neither upstream nor the fork, uncommitted changes,
    or a history with no fork ``main`` — stays a human problem.
    """
    url = git_remote_url("origin")
    if url is None:
        return None  # no origin at all; fetch_remotes() reports it later
    repo_id = _remote_repo_id(url)
    if repo_id is None or repo_id == UPSTREAM_OWNER_REPO:
        return None  # origin is upstream (canonical) or not GitHub: nothing to heal
    if repo_id != FORK_OWNER_REPO:
        return (
            f"origin указывает на {url}, который не является ни апстримом"
            f" ({UPSTREAM_URL}), ни форком ({FORK_SSH_URL})."
            " Проверьте remote вручную: git remote -v"
        )

    # origin points at the fork: heal into the canonical layout.
    log_step("origin указывает на форк (свежий клон); привожу к рабочему раскладу")
    code, out = run_capture(["git", "fetch", "origin"])
    if code != 0:
        return f"git fetch origin (клон форка) не удался:\n{out.strip()}"
    code, out = run_capture(["git", "rev-parse", "--verify", "--quiet",
                             f"origin/{FORK_MAIN_BRANCH}"])
    if code != 0:
        return (
            f"У клона форка нет ветки {FORK_MAIN_BRANCH} (origin/{FORK_MAIN_BRANCH})."
            " Синхронизация требует, чтобы у форка была ветка main."
        )
    code, out = run_capture(["git", "rev-parse", "--verify", "--quiet", LOCAL_BRANCH])
    if code != 0:
        # No local master: create it at the fork's main tip.  The fork's main
        # already carries every protected marker (they are tracked), and any
        # upstream commits it lacks are merged in the normal flow below.
        run(["git", "branch", LOCAL_BRANCH, f"origin/{FORK_MAIN_BRANCH}"])
        log_ok(f"локальная ветка {LOCAL_BRANCH} создана на основе origin/{FORK_MAIN_BRANCH}")
    code, out = run_capture(["git", "rev-parse", "--abbrev-ref", "HEAD"])
    if code != 0 or out.strip() != LOCAL_BRANCH:
        run(["git", "checkout", LOCAL_BRANCH])
        log_ok(f"переключено на ветку {LOCAL_BRANCH}")
    run(["git", "remote", "set-url", "origin", UPSTREAM_URL])
    log_ok(f"origin переуказан на апстрим ({UPSTREAM_URL})")
    run(["git", "remote", "add", FORK_REMOTE, FORK_SSH_URL])
    log_ok(f"добавлен remote {FORK_REMOTE} → {FORK_SSH_URL}")
    log_ok("расклад приведён к рабочему: origin = апстрим, personal = форк, master = main форка")
    return None


def restore_drifted_lockfile() -> bool:
    """Restore a lockfile that a global pnpm older than the pin rewrote.

    pnpm older than 10 does not read ``overrides``/``patchedDependencies``
    from ``pnpm-workspace.yaml``, so a bare ``pnpm install`` rewrites the
    lockfile without those sections and the next frozen install aborts.
    The lockfile is derived data: when it is the only dirty tracked file
    and the copy in HEAD is consistent with the workspace config, the
    working-tree copy is restored from HEAD.  Anything else stays for the
    human, per the clean-tree report.
    """
    code, out = run_capture(["git", "status", "--porcelain", "--untracked-files=no"])
    dirty = [line for line in out.strip().splitlines() if line.strip()]
    if " M pnpm-lock.yaml" not in dirty or not lockfile_mismatch():
        return False
    rc, head_text = run_capture(["git", "show", "HEAD:pnpm-lock.yaml"])
    if rc != 0 or not head_text:
        return False
    sections = ("overrides", "patchedDependencies")
    ws_keys = _yaml_top_keys(REPO_ROOT / "pnpm-workspace.yaml")
    head_keys = _yaml_top_keys_text(head_text)
    if [k for k in sections if k in head_keys] != [k for k in sections if k in ws_keys]:
        return False
    run(["git", "restore", "pnpm-lock.yaml"])
    log_ok("pnpm-lock.yaml был перезаписан глобальным pnpm старее закреплённой версии;"
           " восстановлен из HEAD (используйте `corepack pnpm` вместо голого `pnpm`)")
    return True


def ensure_pnpm_shim() -> Optional[str]:
    """Repoint a standalone pnpm shim at Corepack; return a human problem or None.

    The sync runs pnpm through Corepack, and the build's nested
    ``pnpm --filter …`` calls resolve through PATH.  A standalone pnpm
    whose version differs from the repository pin breaks in both
    directions — older than 10 rewrites the lockfile without the workspace
    overrides; newer refuses to switch under Corepack — so the shim is
    repointed before the merge.  A root-owned directory cannot be fixed
    without privileges; the exact sudo command is returned for the human
    report.
    """
    if not has_command("corepack"):
        return None  # a standalone pnpm self-switches when no Corepack env exists
    path = shutil.which("pnpm")
    if path is None or "corepack" in os.path.realpath(path):
        return None
    pin = pinned_pnpm_version()
    if pin is None:
        return None
    code, out = run_capture(["pnpm", "--version"])
    version = parse_version(out if code == 0 else "")
    if version == pin:
        return None
    version_text = ".".join(str(p) for p in version) if version else "unknown"
    pin_text = ".".join(str(p) for p in pin)
    log_step(f"Голый pnpm ({version_text}) отличается от закреплённого ({pin_text}); перепривязываю shim на Corepack")
    fix_code, fix_out = run_capture(
        ["corepack", "enable", "pnpm", "--install-directory", os.path.dirname(path)]
    )
    if fix_code != 0:
        log_fail(f"corepack enable pnpm не удался: {fix_out.strip()[:160]}")
        return (
            f"Голый pnpm {version_text} в {path} отличается от закреплённого {pin_text}, и автоматическая"
            " перепривязка не удалась (каталог принадлежит root).\n"
            f"  Команда: sudo corepack enable pnpm --install-directory {os.path.dirname(path)}"
        )
    # Pre-download the pinned version so the first pnpm call does not need
    # the network and bare `pnpm` outside the repo resolves to the pin too.
    prep_code, prep_out = run_capture(
        ["corepack", "prepare", f"pnpm@{pin_text}", "--activate"],
        env={"COREPACK_ENABLE_DOWNLOAD_PROMPT": "0"},
    )
    if prep_code != 0:
        log_warn(f"corepack prepare pnpm@{pin_text} не удался ({prep_out.strip()[:120]}); версия скачается при первом вызове")
    log_ok(f"pnpm теперь резолвится через Corepack (pin {pin_text})")
    return None


def fetch_remotes() -> Optional[str]:
    for remote, url_host in ((UPSTREAM_REMOTE, "deepseek-ai/deepseek-harness"),
                             (FORK_REMOTE, "maksim9510/DeepSeek-Harnes")):
        code, out = run_capture(["git", "fetch", remote])
        if code != 0:
            return (
                f"git fetch {remote} не удался (доступ к {url_host}).\n"
                f"{out.strip()}\n"
                "  Проверьте сеть и SSH-ключ, затем повторите: python3 DeepSeek-sync.py"
            )
    return None


def align_master_with_fork() -> Optional[str]:
    """Fast-forward local master onto the fork's main when master is behind.

    master must carry every commit on the fork's main: upstream is an
    ancestor of fork main, so a master that misses fork commits would
    re-merge them and fight the fork's history on the push to main.  When
    master is not ahead of fork main and differs from it, master is behind
    and is fast-forwarded.  Returns a problem or None.  Callers run this
    after both remotes are fetched; fetch_remotes() guarantees the
    personal/main ref exists.
    """
    code, out = run_capture(["git", "rev-list", "--count",
                             f"{FORK_REMOTE}/{FORK_MAIN_BRANCH}..{LOCAL_BRANCH}"])
    if code != 0:
        return f"git rev-list {FORK_REMOTE}/{FORK_MAIN_BRANCH}..{LOCAL_BRANCH} не удался"
    if out.strip() != "0":
        return None  # master is ahead of fork main; nothing to align
    code, out = run_capture(["git", "rev-list", "--count",
                             f"{LOCAL_BRANCH}..{FORK_REMOTE}/{FORK_MAIN_BRANCH}"])
    if code != 0:
        return f"git rev-list {LOCAL_BRANCH}..{FORK_REMOTE}/{FORK_MAIN_BRANCH} не удался"
    if out.strip() == "0":
        return None  # master and fork main are equal
    log(f"Форк main впереди master на {out.strip()} коммит(ов); выравниваю master")
    code, out = run_capture(["git", "merge", "--ff-only",
                             f"{FORK_REMOTE}/{FORK_MAIN_BRANCH}"])
    if code != 0:
        return (
            f"Не удалось выровнять {LOCAL_BRANCH} до {FORK_REMOTE}/{FORK_MAIN_BRANCH}"
            f" (fast-forward):\n{out.strip()}"
        )
    return None


def merge_upstream() -> Tuple[bool, Optional[str]]:
    """Merge origin/master into master.

    Returns (merged_cleanly, human_problem).  A merge with conflicts is
    aborted; the conflict list becomes the human problem.
    """
    ahead = run_capture(["git", "rev-list", "--count",
                         f"{LOCAL_BRANCH}..{UPSTREAM_REMOTE}/{UPSTREAM_BRANCH}"])[1].strip()
    if ahead == "0":
        return True, None  # nothing to merge; already synced

    log(f"Upstream has {ahead} new commit(s); merging")
    code, out = run_capture(["git", "merge", "--no-edit",
                             f"{UPSTREAM_REMOTE}/{UPSTREAM_BRANCH}"])
    if code == 0:
        return True, None

    # Conflict: collect the file list, abort, report for a human.
    _, conflicted = run_capture(["git", "diff", "--name-only", "--diff-filter=U"])
    run(["git", "merge", "--abort"])
    files = [f for f in conflicted.strip().splitlines() if f]
    detail = [
        "Слияние origin/master вызвало конфликты в файлах, где автоматическое"
        " решение небезопасно. Список конфликтных файлов:",
    ]
    detail += [f"  {f}" for f in files] or ["  (список пуст — проверьте git status)"]
    detail += [
        "",
        "Автооткат выполнен: рабочее дерево возвращено к состоянию до слияния.",
        "Вариант ручного решения:",
        f"  git merge origin/{UPSTREAM_BRANCH}",
        "  # разрешите конфликты в перечисленных файлах, сохранив наши правки:",
        "  #   README.md (русский), packages/extensions/locale-ru, DeepSeek-install.py,",
        "  #   packages/web/web-search-routerai (поиск через текущую модель),",
        "  #   packages/bundle/base/cordis.patch.yml (searchProvider: routerai),",
        "  #   tsconfig.base.json / tsconfig.host.json (регистрация пакета)",
        "  git add <файлы> && git commit",
        "  python3 DeepSeek-sync.py   # продолжит: проверки и пуш в main",
    ]
    return False, "\n".join(detail)


def post_merge_checks() -> Tuple[bool, Optional[str], bool]:
    """Verify the merged tree and repair the lockfile if needed.

    Returns (ok, human_problem, lockfile_was_regenerated).
    """
    # 1. Protected markers must survive the merge.
    lost = check_protected_markers("post-merge")
    if lost:
        return False, (
            "После слияния потеряны защищённые правки:\n"
            + "\n".join(f"  {item}" for item in lost)
            + "\n\nСлияние прошло без конфликтов git, но результат не содержит"
              " нашу работу. Не пушьте эту ветку. Восстановите правки и"
              " запустите sync снова."
        ), False

    # 2. Lockfile must satisfy the frozen install.
    if lockfile_mismatch():
        log_step("Lockfile разошёлся с pnpm-workspace.yaml после слияния")
        if not regenerate_lockfile():
            return False, (
                "Не удалось пересобрать pnpm-lock.yaml.\n"
                "  Команда: corepack pnpm install --no-frozen-lockfile --lockfile-only"
            ), False
        code, _ = run_capture(["git", "add", "pnpm-lock.yaml"])
        if code != 0:
            return False, "git add pnpm-lock.yaml не удался", False

    # 3. Dependencies must install.
    log_step("pnpm install")
    code, out = run_capture(
        _pnpm_command() + ["install", "--frozen-lockfile", "--prefer-offline"],
        env={"COREPACK_ENABLE_DOWNLOAD_PROMPT": "0", "CI": "true"},
        cwd=str(REPO_ROOT),
    )
    if code != 0:
        tail = "\n".join(out.strip().splitlines()[-12:])
        return False, (
            "pnpm install --frozen-lockfile не удался после слияния:\n"
            f"{tail}\n"
            "  Команда для повторения: corepack pnpm install"
        ), True

    # 4. Fast repository gates: typecheck compiles our locale pack together
    #    with upstream code.  Locale-key drift (upstream adds or removes
    #    dictionary keys) is repaired automatically and the typecheck
    #    reruns; anything else is a human problem.
    for attempt in (1, 2, 3):
        log_step(f"Проверка типов (попытка {attempt})")
        code, out = run_capture(
            ["corepack", "pnpm", "run", "typecheck"],
            env={"COREPACK_ENABLE_DOWNLOAD_PROMPT": "0", "CI": "true"},
            cwd=str(REPO_ROOT),
        )
        if code == 0:
            log_ok("typecheck прошёл")
            return True, None, True

        errors = parse_locale_key_errors(out)
        if not errors:
            tail = "\n".join(out.strip().splitlines()[-25:])
            return False, (
                "pnpm run typecheck не удался после слияния:\n"
                f"{tail}\n"
                "Это означает, что апстрим-изменения несовместимы с нашими"
                " правками на уровне типов. Требуется ручное разрешение."
            ), True

        log_step("Апстрим изменил ключи локализации; адаптирую ru-словари автоматически")
        if not adapt_ru_dictionaries(errors):
            unknown = "\n".join(f"  {e}" for e in errors)
            return False, (
                "Обнаружены изменения ключей локализации, которые не удалось"
                f" применить автоматически:\n{unknown}"
            ), True
        code, staged = run_capture(["git", "add", "--", RU_LOCALES_DIR])
        if code != 0:
            return False, f"git add {RU_LOCALES_DIR} не удался", True

    return False, "typecheck не прошёл после трёх попыток адаптации", True


def parse_locale_key_errors(output: str) -> List[Tuple[str, str, str]]:
    """Extract locale-key drift from typecheck output.

    Returns (kind, key, file) triples: ``kind`` is ``missing`` when the ru
    dictionary lacks a key the owner namespace requires and ``unknown`` when
    the ru dictionary carries a key the owner namespace no longer declares;
    ``file`` is the ru dictionary path the TypeScript error points at.
    """
    errors: List[Tuple[str, str, str]] = []
    file_path = ""
    patterns = [
        # TS1360: Property '"chat.foo"' is missing in type ... but required.
        # TypeScript wraps the key in double quotes inside single quotes, so
        # both quote layers must be consumed.
        (re.compile(r"Property ['\"]+([^'\"]+)['\"]+ is missing in type"), "missing"),
        # TS2353: '...' does not exist in type 'Record<...>'; same double
        # quoting applies.
        (re.compile(r"and ['\"]+([^'\"]+)['\"]+ does not exist in type"), "unknown"),
    ]
    for line in output.splitlines():
        file_match = re.search(r"^(packages/extensions/locale-ru/[^()]+\.ts)\(", line)
        if file_match:
            # Carry the file forward: a TS1360 detail line (Property ... is
            # missing) has no path of its own; it belongs to the TS1360
            # header line above it, which does.
            file_path = file_match.group(1)
        for pattern, kind in patterns:
            match = pattern.search(line)
            if match:
                errors.append((kind, match.group(1), file_path))
    return errors


def adapt_ru_dictionaries(errors: List[Tuple[str, str, str]]) -> bool:
    """Apply locale-key drift to the ru dictionaries; True when all applied.

    A missing key is added with a translation from RU_TRANSLATIONS, falling
    back to the upstream English text of the same key (read from the owning
    package's locale.ts).  An unknown key is removed.  The target dictionary
    is the file the TypeScript error names, so no key-to-namespace guessing
    is involved.  The typecheck rerun is the arbiter of correctness.
    """
    locales_dir = REPO_ROOT / RU_LOCALES_DIR
    files_touched = 0
    for kind, key, rel_file in errors:
        dict_path = REPO_ROOT / rel_file if rel_file else None
        if dict_path is None or not dict_path.exists():
            # Fall back to searching every ru dictionary for the key.
            candidates = [p for p in locales_dir.glob("*.ts") if f"'{key}'" in p.read_text(encoding="utf-8")]
            dict_path = candidates[0] if candidates else None
        if dict_path is None:
            log_warn(f"{key}: словарь не найден; пропуск")
            continue
        text = dict_path.read_text(encoding="utf-8")
        if kind == "missing":
            if f"'{key}'" in text:
                continue  # already present; the error list was stale
            translation = RU_TRANSLATIONS.get(key) or upstream_english_text(key)
            if translation is None:
                log_warn(f"{key}: нет перевода и нет английского текста; пропуск")
                continue
            entry = f"  '{key}': {json.dumps(translation, ensure_ascii=False)},\n"
            anchor = _dict_insert_anchor(text)
            text = text[:anchor] + entry + text[anchor:]
            log_ok(f"добавлен ключ {key}")
        else:
            pattern = re.compile(rf"^\s*'{re.escape(key)}':.*\n", re.MULTILINE)
            if not pattern.search(text):
                continue  # already removed; the error list was stale
            text = pattern.sub("", text)
            log_ok(f"удалён ключ {key}")
        dict_path.write_text(text, encoding="utf-8")
        files_touched += 1
    return files_touched > 0 or not errors


def _dict_insert_anchor(text: str) -> int:
    """Byte offset where a new dictionary entry belongs: after the last
    ``'key': 'value',`` line, before the closing ``} satisfies``."""
    satisfies = text.rfind("} satisfies")
    if satisfies == -1:
        return -1
    return text.rfind("\n", 0, satisfies) + 1


def upstream_english_text(key: str) -> Optional[str]:
    """Read the English text for a locale key from the owning package.

    The owner is found by scanning the client packages' locale.ts and
    locales.ts files for the English dictionary block (the last occurrence
    of the key, since zh comes first).  Returns None when no owner declares
    the key.
    """
    needle = f"'{key}':"
    owner_files: List[Path] = []
    for pattern in ("*/src/client/locale.ts", "*/src/client/locales.ts", "*/src/client/locales/*.ts"):
        owner_files.extend((REPO_ROOT / "packages/client").glob(pattern))
    for path in sorted(set(owner_files)):
        try:
            text = path.read_text(encoding="utf-8")
        except OSError:
            continue
        matches = list(re.finditer(re.escape(needle), text))
        if len(matches) >= 2:
            segment = text[matches[-1].start():matches[-1].start() + 300]
            value = re.search(r":\s*'((?:[^'\\]|\\.)*)'", segment)
            if value:
                return value.group(1)
    return None


def push_to_main() -> Optional[str]:
    """Push master to the fork's main branch.  Returns a problem or None."""
    code, out = run_capture(["git", "push", FORK_REMOTE, f"{LOCAL_BRANCH}:{FORK_MAIN_BRANCH}"])
    if code != 0:
        return (
            f"git push {FORK_REMOTE} {LOCAL_BRANCH}:{FORK_MAIN_BRANCH} не удался:\n"
            f"{out.strip()}\n"
            "  Если remote ушёл вперёд: git fetch personal && git merge personal/main"
        )
    return None


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main(argv: List[str]) -> int:
    if "--help" in argv or "-h" in argv:
        print(__doc__)
        return 0

    # Never run two syncs at once (the daily cron plus a manual run).
    lock = REPO_ROOT / ".sync-lock"
    if lock.exists():
        log("Другая синхронизация уже выполняется (.sync-lock существует); выход.")
        return 0
    lock.write_text(str(os.getpid()), encoding="utf-8")

    try:
        return _sync()
    finally:
        lock.unlink(missing_ok=True)


def _sync() -> int:
    log(f"DeepSeek Harness upstream sync v{__version__}")
    HUMAN_REPORT.unlink(missing_ok=True)  # only the latest run's report stays

    restore_drifted_lockfile()

    problem = ensure_pnpm_shim()
    if problem:
        write_human_report("Синхронизация остановлена: голый pnpm отличается от пина", [problem])
        return 1

    # A fresh clone of the fork has no master, and its only remote (origin)
    # points at the fork.  Heal that layout before the clean-tree check, so
    # the sync can run straight after `git clone` of the fork.
    problem = ensure_fork_is_origin()
    if problem:
        write_human_report("Синхронизация остановлена: расклад репозитория", [problem])
        return 1

    problem = ensure_clean_tree()
    if problem:
        write_human_report("Синхронизация остановлена: рабочее дерево", [problem])
        return 1

    problem = fetch_remotes()
    if problem:
        write_human_report("Синхронизация остановлена: сеть/доступ", [problem])
        return 1

    # The fork's main may carry commits that local master has not seen yet
    # (for example, the sync script was updated and pushed through main).
    # master must be fast-forwarded onto fork main before the upstream
    # comparison, so those commits are never re-merged and the push to main
    # stays a fast-forward.
    problem = align_master_with_fork()
    if problem:
        write_human_report("Синхронизация остановлена: выравнивание master с main форка", [problem])
        return 1

    ahead = run_capture(["git", "rev-list", "--count",
                         f"{LOCAL_BRANCH}..{UPSTREAM_REMOTE}/{UPSTREAM_BRANCH}"])[1].strip()
    if ahead == "0":
        log("Upstream не обновлялся; проверяю push в main")
        problem = push_to_main()
        if problem:
            write_human_report("Синхронизация остановлена: push", [problem])
            return 1
        log_ok("Всё синхронизировано, main актуален")
        return 0

    log_step(f"Апстрим впереди на {ahead} коммит(ов)")

    lost = check_protected_markers("pre-merge")
    if lost:
        write_human_report("Синхронизация остановлена: защищённые правки отсутствуют ДО слияния", [
            "Одна или несколько наших правок уже отсутствуют в master."
            " Скрипт не синхронизирует такое состояние вслепую:",
            *[f"  {item}" for item in lost],
        ])
        return 1

    pre_merge_head = run_capture(["git", "rev-parse", "HEAD"])[1].strip()

    merged, problem = merge_upstream()
    if problem:
        write_human_report("Синхронизация остановлена: конфликты слияния", [problem])
        return 1
    if not merged:
        return 1

    ok, problem, _ = post_merge_checks()
    if not ok:
        # Roll the failed merge back to the exact pre-merge commit so the
        # tree returns to the last good state; the report explains what a
        # human needs to decide.
        log_warn("Проверки после слияния не прошли; откатываю merge")
        run(["git", "reset", "--hard", pre_merge_head])
        run(["git", "clean", "-fd", "--", "packages/extensions/locale-ru"])
        write_human_report("Синхронизация остановлена: проверки после слияния", [problem or "неизвестная ошибка"])
        return 1

    # The merge commit itself was already created by `git merge`.  What can
    # remain on top of it is the sync's own repair work: the regenerated
    # lockfile and the adapted ru dictionaries.  Commit that as one follow-up
    # commit so the merge commit stays purely upstream.
    code, out = run_capture(["git", "status", "--porcelain", "--untracked-files=no"])
    if code == 0 and out.strip():
        code, out = run_capture([
            "git", "commit",
            "-m", "chore(sync): realign fork repairs after upstream merge",
            "-m", "Lockfile regenerated for the frozen install and ru locale"
                  " dictionaries realigned with upstream key changes by"
                  " DeepSeek-sync.py.",
        ])
        if code != 0:
            write_human_report("Синхронизация остановлена: git commit правок", [
                f"{out.strip()}",
                "  Команда: git commit -m 'chore(sync): realign fork repairs after upstream merge'",
            ])
            return 1

    log_step("Пуш в main")
    problem = push_to_main()
    if problem:
        write_human_report("Синхронизация остановлена: push", [problem])
        return 1

    log_ok("Синхронизация завершена: master слит с апстримом и запушен в main")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
