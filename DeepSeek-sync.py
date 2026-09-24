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
* The local web search shim (tools/dsh-search-shim), which upstream has no
  counterpart for
* The CLI source-launch resolution default (apps/cli/src/profile-boot.ts)
  was removed when upstream deleted the link backend: the file now matches
  upstream's runtime resolution shape
* The lockfile fix that keeps pnpm install working

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
   push ``master`` to the fork's ``main`` and to the backup ``rezerv``
   branch, then exit 0.
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

import os
import re
import shutil
import subprocess
import sys
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Set, Tuple

__version__ = "1.4.0"

UPSTREAM_REMOTE = "origin"
FORK_REMOTE = "personal"
UPSTREAM_BRANCH = "master"
LOCAL_BRANCH = "master"
FORK_MAIN_BRANCH = "main"
FORK_BACKUP_BRANCH = "rezerv"

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
    # The shim is fork-only: upstream never has these paths, so a merge that
    # removed them means the fork lost its deployment source, not that a
    # conflict was resolved.  The installer deploys from here.
    ("tools/dsh-search-shim/server.mjs", "web_search_20250305"),
    ("tools/dsh-search-shim/provider-route.mjs", "resolveActiveRoute"),
    ("DeepSeek-install.py", "SHIM_SOURCE_DIR"),
    # Browser-tool provisioning is fork-only too: a merge that dropped it
    # would leave the agent without a browser.  The marker is the constant the
    # two provisioning steps and their doctor checks share.
    ("DeepSeek-install.py", "BROWSER_BUNDLE"),
]

#: Locale dictionaries the ru language pack owns, relative to the ru package's
#: client/locales directory.  When upstream adds or removes keys in the owning
#: namespace, the sync realigns these dictionaries automatically with a
#: deterministic key-union diff (added keys get a Russian translation from
#: RU_TRANSLATIONS or fall back to the owner's English text; removed keys are
#: dropped) and re-records the pairing sidecar.
RU_LOCALES_DIR = "packages/extensions/locale-ru/src/client/locales"

#: Russian translations for keys upstream may add, keyed by the full locale
#: key.  Keys missing here fall back to the upstream English text.
RU_TRANSLATIONS = {
    'chat.turnNavigation.jumpLoad': 'Загрузить и перейти к ходу {turn}',
    'queue.image': 'Изображение в очереди сообщений',
    'notice.attachmentsUnsupported': '/{command} не принимает вложения; сначала удалите их',
    'command.attachmentsUnsupported': '/{command} не принимает вложения; сначала удалите их',
    'layout.fileAttachments': 'Файлы ×{count}',
    'attachment.pending': 'Вложения, ожидающие отправки',
    'attachment.scrollLeft': 'Прокрутить вложения влево',
    'attachment.scrollRight': 'Прокрутить вложения вправо',
    'attachment.dropTitle': 'Перетащите файлы или изображения сюда, чтобы добавить',
    'attachment.dropDesc': 'До {count} изображений, по {size} каждое',
    'attachment.dropBlocked': 'Сейчас нельзя добавить файлы и изображения',
    'file.attach': 'Добавить вложение',
    'file.pending': 'Файлы, ожидающие отправки',
    'file.remove': 'Удалить файл {name}',
    'file.uploading': 'Загрузка…',
    'file.uploadFailed': 'Загрузка не удалась; нажмите, чтобы повторить',
    'file.retry': 'Повторить загрузку {name}',
    'file.stillUploading': 'Файлы всё ещё загружаются; отправьте после завершения',
    'file.sessionUnavailable': 'Сессия недоступна; файлы не могут быть загружены',
    'file.notStaged': 'Файл не загружен; добавьте его заново и попробуйте снова',
    'file.label': 'Файл',
    'queue.file': 'Файл в очереди: {name}',
    'close': 'Закрыть',
    'mode': 'Режим доступа, текущий: {name}',
    'auto.label': 'Автопроверка',
    'auto.badge': 'ЭКСП',
    'auto.description': 'Запуск без песочницы; каждый нативный вызов инструмента и внутренний вызов PTC предварительно проверяются той же моделью (экспериментально).',
    'auto.confirm.title': 'Включить Auto review (экспериментально)?',
    'auto.confirm.description': 'Auto review не использует песочницу. Перед каждым нативным вызовом инструмента и внутренним вызовом PTC та же модель, что и текущий агент, проводит проверку. Функция пока экспериментальна: возможны ложные допуски и отказы, а также расход дополнительных токенов.',
    'auto.confirm.acknowledge': 'Я понимаю эти риски и хочу продолжить',
    'auto.confirm.enable': 'Включить Auto review',
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
            _pnpm_command() + ["install", "--no-frozen-lockfile", "--lockfile-only"],
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
        # No Corepack: the sync runs pnpm through the bare shim.  A shim
        # whose version differs from the pin is a risk, not a blocker — an
        # older pnpm rewrites the lockfile without the workspace overrides,
        # a newer one can misbehave under the nested `pnpm --filter` calls.
        # Warn loudly so the human can align the shim, but let the sync try
        # the fallback for hosts where Corepack is genuinely unavailable.
        pin = pinned_pnpm_version()
        path = shutil.which("pnpm")
        if pin and path and "corepack" not in os.path.realpath(path):
            code, out = run_capture(["pnpm", "--version"])
            version = parse_version(out if code == 0 else "")
            if version != pin:
                version_text = ".".join(str(p) for p in version) if version else "unknown"
                pin_text = ".".join(str(p) for p in pin)
                log_warn(
                    f"Corepack отсутствует, и голый pnpm {version_text} в {path} не совпадает с"
                    f" закреплённым {pin_text}. Версия-старее-10 перезапишет pnpm-lock.yaml без"
                    " workspace overrides; установите Corepack и активируйте пиновую версию,"
                    " чтобы избежать нестабильности lockfile."
                )
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

    # Distinguish a real conflict (exit 1 with conflicted paths) from any
    # other merge failure (exit 128: no committer identity, bad ref, ...);
    # reporting the actual output is the only way a human can fix it.
    _, conflicted = run_capture(["git", "diff", "--name-only", "--diff-filter=U"])
    files = [f for f in conflicted.strip().splitlines() if f]
    if code != 1 or not files:
        run(["git", "merge", "--abort"])
        return False, (
            "git merge origin/master не удался (не конфликт слияния):\n"
            f"{out.strip()}\n"
            "  Устраните причину (например, настройте git identity:"
            " git config --global user.name / user.email) и запустите sync снова."
        )

    # Conflict: collect the file list, abort, report for a human.
    run(["git", "merge", "--abort"])
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
        "  #   tools/dsh-search-shim (локальный поисковый шим),",
        "  #   apps/cli/src/profile-boot.ts (останется в форме апстрима:",
        "  #     link-режим удалён вместе с бэкендом апстрима),",
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
    #    dictionary keys) is repaired automatically from a deterministic
    #    key-union diff — every drifted key is seen in one pass, so one
    #    adaptation and one rerun normally suffice; the loop just guards
    #    against an imperfect owner mapping.  Anything else is a human
    #    problem.
    max_attempts = 3
    for attempt in range(1, max_attempts + 1):
        log_step(f"Проверка типов (попытка {attempt})")
        code, out = run_capture(
            _pnpm_command() + ["run", "typecheck"],
            env={"COREPACK_ENABLE_DOWNLOAD_PROMPT": "0", "CI": "true"},
            cwd=str(REPO_ROOT),
        )
        if code == 0:
            log_ok("typecheck прошёл")
            return True, None, True

        if attempt == max_attempts:
            # Exhausted adaptations; the last typecheck already failed.
            drift = locale_drift()
            if drift:
                summary = "\n".join(
                    f"  {rel}: missing={','.join(missing) or '-'} extra={','.join(extra) or '-'}"
                    for rel, missing, extra in drift
                )
                return False, (
                    "pnpm run typecheck не прошёл после слияния, и остались расхождения"
                    " ключей ru-локалей, которые скрипт не смог устранить:\n"
                    f"{summary}\n"
                    "Требуется ручное разрешение."
                ), True
            tail = "\n".join(out.strip().splitlines()[-25:])
            return False, (
                "pnpm run typecheck не удался после слияния:\n"
                f"{tail}\n"
                "Это означает, что апстрим-изменения несовместимы с нашими"
                " правками на уровне типов. Требуется ручное разрешение."
            ), True

        log_step("Проверяю расхождения ключей локализации; адаптирую ru-словари автоматически")
        changed, problems = realign_ru_dictionaries()
        if not changed:
            tail = "\n".join(out.strip().splitlines()[-25:])
            extra = (
                "\n\nНе удалось добавить ключи:\n" + "\n".join(f"  {p}" for p in problems)
                if problems else ""
            )
            return False, (
                "pnpm run typecheck не прошёл, но расхождений ключей локализации"
                f" не найдено:\n{tail}{extra}"
            ), True
        code, staged = run_capture(["git", "add", "--", RU_LOCALES_DIR])
        if code != 0:
            return False, f"git add {RU_LOCALES_DIR} не удался", True

    return False, "typecheck не прошёл после попыток адаптации", True


def _dict_block(text: str, var: str) -> Optional[str]:
    """Body of an ``export const <var> = { ... }`` dictionary literal.

    Handles the annotated form (``export const zh: { [K in keyof typeof en]:
    string } = {``) by locating the ``=`` first; the first ``{`` after it is
    the literal.  Returns None when the declaration is missing.
    """
    match = re.search(r"export const " + re.escape(var) + r"\b", text)
    if not match:
        return None
    eq = text.find("=", match.end())
    if eq == -1:
        return None
    brace = text.find("{", eq)
    if brace == -1:
        return None
    depth = 0
    for i in range(brace, len(text)):
        if text[i] == "{":
            depth += 1
        elif text[i] == "}":
            depth -= 1
            if depth == 0:
                return text[brace + 1:i]
    return None


_LOCALE_KEY_RE = re.compile(r"^\s*(?:'([^']+)'|([A-Za-z_$][\w$.]*))\s*:")
_LOCALE_KEY_VALUE_RE = re.compile(r"^\s*(?:'([^']+)'|([A-Za-z_$][\w$.]*))\s*:\s*'((?:[^'\\]|\\.)*)'")


def _block_keys(block: str) -> Set[str]:
    """Dictionary keys of a literal body; quoted (``'a.b'``) and unquoted forms."""
    keys: Set[str] = set()
    for line in block.splitlines():
        match = _LOCALE_KEY_RE.match(line)
        if match:
            keys.add(match.group(1) or match.group(2))
    return keys


def _locale_source_files(pkg: Path) -> List[Path]:
    """Locale source files of one package (where its zh dict lives)."""
    return [
        f for f in sorted(pkg.rglob("*.ts"))
        if "/lib/" not in str(f)
        and (re.search(r"locales?[^/]*\.ts$", str(f)) or "/locales/" in str(f))
    ]


def _zh_keys_by_namespace() -> Dict[str, Set[str]]:
    """Namespace → zh key union, resolved from the owner package's zh dict.

    The owner package of a namespace is found from its ``LocaleNamespaceMap``
    entry (``'settings.models': ModelsKey``, ``keyof typeof accessEn``),
    a ``*_NS = '<ns>'`` constant, or a ``ctx.locale.register/bind`` literal.
    The union is the key set of the zh-equivalent dictionary the entry names:
    the ``keyof typeof <dict>`` the type alias resolves to, an inlined
    ``keyof typeof <dict>``, or an inlined literal union alias — never a
    sibling namespace's dict in the same package.  Owners may live under any
    package group (client locales, extensions, session-query).  A namespace
    with no resolvable owner is left out; callers skip such dictionaries
    instead of guessing a union.
    """
    root = REPO_ROOT / "packages"
    texts: Dict[Path, str] = {}
    for f in root.rglob("*.ts"):
        rel = str(f)
        if "/lib/" in rel or "/node_modules/" in rel or rel.startswith(str(REPO_ROOT / "packages" / "extensions" / "locale-ru")):
            continue
        try:
            texts[f] = f.read_text(encoding="utf-8")
        except OSError:
            continue

    # 1. LocaleNamespaceMap entries → ns → (interface file, type expression).
    ns_expr: Dict[str, Tuple[Path, str]] = {}
    for f, text in texts.items():
        cursor = 0
        while True:
            m = re.search(r"interface LocaleNamespaceMap\s*\{", text[cursor:])
            if not m:
                break
            start = cursor + m.end()
            depth, i = 1, start
            while depth and i < len(text):
                if text[i] == "{":
                    depth += 1
                elif text[i] == "}":
                    depth -= 1
                i += 1
            if depth:
                break
            for line in text[start:i - 1].splitlines():
                entry = re.match(r"^\s*(?:'([^']+)'|([A-Za-z_$][\w$.]*))\s*:\s*(.+)$", line)
                if entry:
                    ns = entry.group(1) or entry.group(2)
                    ns_expr[ns] = (f, entry.group(3).split("//")[0].strip())
            cursor = i

    # 2. Type references: `type X = keyof typeof <dict>` and ``type X = <literal union>``.
    alias_dict: Dict[str, Tuple[Path, str]] = {}  # alias -> (file, dict var)
    union_literal: Dict[str, Set[str]] = {}       # alias -> literal union keys
    for f, text in texts.items():
        for name, var in re.findall(
                r"^(?:export )?type ([A-Za-z_$][\w$.]*)\s*=\s*keyof typeof ([A-Za-z_$][\w$.]*)\b",
                text, re.MULTILINE):
            alias_dict.setdefault(name, (f, var))
        for m in re.finditer(
                r"(?:export )?type ([A-Za-z_$][\w$.]*)\s*=\s*((?:\s*\|\s*'[^']+'){2,})",
                text):
            union_literal.setdefault(m.group(1),
                                     set(re.findall(r"'([^']+)'", m.group(2))))

    def pkg_root_of(path: Path) -> Optional[Path]:
        for candidate in (path.parent, *path.parents):
            if candidate == root:
                return None
            if (candidate / "package.json").exists():
                return candidate
        return None

    def dict_keys_in_file(f: Path, var: str) -> Optional[Set[str]]:
        block = _dict_block(texts.get(f, ""), var)
        if block is None and f not in texts:
            try:
                block = _dict_block(f.read_text(encoding="utf-8"), var)
            except OSError:
                block = None
        return _block_keys(block) if block is not None else None

    def dict_var_in_pkg(pkg: Path, var: str) -> Optional[Set[str]]:
        """Keys of `export const <var> = {` in pkg, only when unambiguous."""
        hits = []
        for f in _locale_source_files(pkg):
            block = _dict_block(f.read_text(encoding="utf-8", errors="replace"), var)
            if block is not None:
                hits.append(_block_keys(block))
        return hits[0] if len(hits) == 1 else None

    # 3. Namespace → owner packages via *_NS / NS constants and register/bind.
    ns_pkgs: Dict[str, Set[Path]] = {}
    ns_any_ns_const_file_rexn = re.compile(
        r"(?<![A-Za-z0-9_])(?:[A-Za-z_$][\w$]*_NS|NS)\s*=\s*'([^']+)'")
    ns_register = re.compile(r"locale\.(?:register|bind)\(\s*'([^']+)'")
    for f, text in texts.items():
        pkg = pkg_root_of(f)
        if pkg is None:
            continue
        for ns in ns_any_ns_const_file_rexn.findall(text) + ns_register.findall(text):
            ns_pkgs.setdefault(ns, set()).add(pkg)
    for ns, (f, _) in ns_expr.items():
        pkg = pkg_root_of(f)
        if pkg is not None:
            ns_pkgs.setdefault(ns, set()).add(pkg)

    by_ns: Dict[str, Set[str]] = {}
    for ns, pkgs in ns_pkgs.items():
        resolved: Optional[Set[str]] = None
        expr = ns_expr.get(ns)
        if expr is not None:
            _, expr_str = expr
            if expr_str.startswith("keyof typeof "):
                resolved = dict_var_in_pkg(next(iter(pkgs)), expr_str.split("keyof typeof ", 1)[1].strip())
            else:
                alias = expr_str
                if alias in union_literal:
                    resolved = union_literal[alias]
                elif alias in alias_dict:
                    f, var = alias_dict[alias]
                    resolved = dict_keys_in_file(f, var)
        if resolved is None:
            # No entry, or it could not be pinned: use the owner package's
            # single zh dictionary, else the plain `zh` of any one candidate.
            for pkg in pkgs:
                keys = dict_var_in_pkg(pkg, "zh")
                if keys is not None:
                    resolved = keys
                    break
        if resolved is not None:
            by_ns[ns] = resolved
    return by_ns


def _ru_file_namespaces() -> Dict[str, List[str]]:
    """Ru dictionary file stem → namespaces it fills (from the registry index)."""
    index = (REPO_ROOT / RU_LOCALES_DIR / "index.ts").read_text(encoding="utf-8")
    var_to_ns: Dict[str, str] = {}
    for ns, var in re.findall(r"'([^']+)':\s*(\w+),", index):
        var_to_ns[var] = ns
    file_to_ns: Dict[str, List[str]] = {}
    for var, stem in re.findall(r"ru as (\w+)\s*}\s*from\s*'\./([^']+)\.ts'", index):
        ns = var_to_ns.get(var)
        if ns:
            file_to_ns.setdefault(stem, []).append(ns)
    return file_to_ns


def locale_drift() -> List[Tuple[str, List[str], List[str]]]:
    """Per ru dictionary: (rel path, missing keys, extra keys) vs owner unions.

    The diff is deterministic: it compares each ru dictionary's keys against
    the zh key union of the namespaces it fills, so every drifted key is seen
    in one pass — no dependence on TypeScript's capped diagnostics.
    """
    zh_by_ns = _zh_keys_by_namespace()
    drift: List[Tuple[str, List[str], List[str]]] = []
    for stem, namespaces in sorted(_ru_file_namespaces().items()):
        dict_path = REPO_ROOT / RU_LOCALES_DIR / f"{stem}.ts"
        if not dict_path.exists():
            continue
        if any(ns not in zh_by_ns for ns in namespaces):
            # An unresolvable owner union must not guess: leave the
            # dictionary to the typecheck, which is the arbiter anyway.
            continue
        block = _dict_block(dict_path.read_text(encoding="utf-8"), "ru")
        if block is None:
            continue
        ru_keys = _block_keys(block)
        union: Set[str] = set()
        for ns in namespaces:
            union |= zh_by_ns.get(ns, set())
        missing = sorted(union - ru_keys)
        extra = sorted(ru_keys - union)
        if missing or extra:
            drift.append((str(dict_path.relative_to(REPO_ROOT)), missing, extra))
    return drift


def _en_text_for(namespaces: List[str], key: str) -> Optional[str]:
    """English text of a key from its owner's en dictionary.

    Owner packages are tried first (their en block is the authoritative
    text), then every client locale file as a fallback for keys upstream
    declared without a zh/en translation yet.
    """
    def scan(files: List[Path]) -> Optional[str]:
        for f in files:
            block = _dict_block(f.read_text(encoding="utf-8", errors="replace"), "en")
            if block is None:
                continue
            for line in block.splitlines():
                m = _LOCALE_KEY_VALUE_RE.match(line)
                if m and (m.group(1) or m.group(2)) == key:
                    return m.group(3)
        return None
    roots = [r for r in (REPO_ROOT / "packages" / "client",
                         REPO_ROOT / "packages" / "extensions") if r.exists()]
    if namespaces:
        ns_pattern = re.compile(
            r"(?<![A-Za-z0-9_])(?:NS|COMMON_NS|LOCALE_NS)\s*=\s*'(?:"
            + "|".join(re.escape(ns) for ns in namespaces) + ")'")
        for root in roots:
            for pkg in root.glob("*"):
                if not pkg.is_dir():
                    continue
                for f in pkg.rglob("*.ts"):
                    try:
                        if ns_pattern.search(f.read_text(encoding="utf-8")):
                            break
                    except OSError:
                        continue
                else:
                    continue
                value = scan(_locale_source_files(pkg))
                if value is not None:
                    return value
    for root in roots:
        for pkg in root.glob("*"):
            if pkg.is_dir():
                value = scan(_locale_source_files(pkg))
                if value is not None:
                    return value
    return None


def _key_quote_style(text: str) -> bool:
    """True when the dictionary quotes its keys (``'a.b':``); unquoted otherwise."""
    quoted = len(re.findall(r"^\s*'([^']+)':", text, re.MULTILINE))
    unquoted = len(re.findall(r"^\s*[A-Za-z_$][\w$.]*\s*:", text, re.MULTILINE))
    return quoted >= unquoted


def _ts_escape(value: str) -> str:
    """Escape a single-quoted TS string literal body.

    Existing escape sequences (\n, \t, \', \\) pass through unchanged so a
    value read from an en dictionary is emitted exactly as written.
    """
    out: List[str] = []
    i = 0
    while i < len(value):
        ch = value[i]
        if ch == "\\" and i + 1 < len(value) and value[i + 1] in "nrtb\\'\"0":
            out.append(ch + value[i + 1])
            i += 2
            continue
        if ch == "'":
            out.append("\\'")
        elif ch == "\\":
            out.append("\\\\")
        else:
            out.append(ch)
        i += 1
    return "".join(out)


def _insert_key(text: str, key: str, value: str, quoted: bool) -> Optional[str]:
    """Insert one dictionary entry before the closing ``} satisfies``.

    The key is quoted unless the surrounding dictionary uses the unquoted
    style and the key is a valid identifier; a dotted key must always be
    quoted (``'add.me': …`` is the only legal spelling).
    """
    anchor = text.rfind("} satisfies")
    if anchor == -1:
        return None
    pos = text.rfind("\n", 0, anchor) + 1
    literal = f"'{key}'" if quoted or not re.fullmatch(r"[A-Za-z_$][\w$]*", key) else key
    return text[:pos] + f"  {literal}: '{_ts_escape(value)}',\n" + text[pos:]


def _drop_key_line(text: str, key: str) -> Optional[str]:
    """Remove a key line plus its indented value-continuation lines."""
    match = re.search(rf"^\s*(?:'{re.escape(key)}'|{re.escape(key)})\s*:",
                      text, re.MULTILINE)
    if not match:
        return None
    cursor = match.end()
    line_end = text.find("\n", cursor)
    cursor = cursor if line_end == -1 else line_end + 1
    while cursor < len(text):
        nl = text.find("\n", cursor)
        line = text[cursor:nl if nl != -1 else len(text)]
        stripped = line.strip()
        if not stripped:
            cursor = nl + 1 if nl != -1 else len(text)
            continue
        if stripped.startswith("}") or _LOCALE_KEY_RE.match(line) or not line[0].isspace():
            break
        cursor = nl + 1 if nl != -1 else len(text)
    return text[:match.start()] + text[cursor:]


def realign_ru_dictionaries() -> Tuple[List[str], List[str]]:
    """Apply the full locale drift; returns (changed rel paths, problems).

    Missing keys are added with a translation from RU_TRANSLATIONS, falling
    back to the owner's English text; extra keys are dropped.  The whole
    drift is applied in one pass (no iteration against re-parsed compiler
    output), and the rerun typecheck is the arbiter of correctness.
    """
    drift = locale_drift()
    changed: List[str] = []
    problems: List[str] = []
    ns_by_file = _ru_file_namespaces()
    for rel, missing, extra in drift:
        dict_path = REPO_ROOT / rel
        text = dict_path.read_text(encoding="utf-8")
        original = text
        quoted = _key_quote_style(text)
        namespaces = ns_by_file.get(dict_path.stem, [])
        for key in extra:
            new_text = _drop_key_line(text, key)
            if new_text is None:
                problems.append(f"{rel}: ключ {key} не найден для удаления")
            else:
                text = new_text
                log_ok(f"удалён ключ {key} ({rel})")
        for key in missing:
            translation = RU_TRANSLATIONS.get(key) or _en_text_for(namespaces, key)
            if translation is None:
                problems.append(f"{rel}: нет перевода для ключа {key}")
                continue
            new_text = _insert_key(text, key, translation, quoted)
            if new_text is None:
                problems.append(f"{rel}: нет точки вставки для ключа {key}")
            else:
                text = new_text
                log_ok(f"добавлен ключ {key} ({rel})")
        if text != original:
            dict_path.write_text(text, encoding="utf-8")
            changed.append(rel)
    return changed, problems


def push_to_main() -> Optional[str]:
    """Push master to the fork's main branch.  Returns a problem or None.

    A remote that moved ahead rejects a non-fast-forward push.  Pull the
    fork's main tip into master first so a later sync never requires a
    manual `git merge`; only merge topologies without conflicts are folded
    in automatically — a conflicted merge still stops for the human.
    """
    code, out = run_capture(
        ["git", "push", FORK_REMOTE, f"{LOCAL_BRANCH}:{FORK_MAIN_BRANCH}"]
    )
    if code == 0:
        return None
    log_step(f"Push отклонён; подтягиваю {FORK_REMOTE}/{FORK_MAIN_BRANCH} в {LOCAL_BRANCH}")
    fetch_code, fetch_out = run_capture(["git", "fetch", FORK_REMOTE])
    if fetch_code != 0:
        return (
            f"git fetch {FORK_REMOTE} не удался после отклонённого push:\n"
            f"{fetch_out.strip()}\n"
            f"  Команда для повторения: git push {FORK_REMOTE} {LOCAL_BRANCH}:{FORK_MAIN_BRANCH}"
        )
    merge_code, merge_out = run_capture(
        ["git", "merge", "--no-edit", f"{FORK_REMOTE}/{FORK_MAIN_BRANCH}"]
    )
    if merge_code != 0:
        return (
            f"git merge {FORK_REMOTE}/{FORK_MAIN_BRANCH} не удался после отклонённого push:\n"
            f"{merge_out.strip()}\n"
            "  Разрешите конфликты, зафиксируйте merge и запустите sync снова."
        )
    code, out = run_capture(
        ["git", "push", FORK_REMOTE, f"{LOCAL_BRANCH}:{FORK_MAIN_BRANCH}"]
    )
    if code != 0:
        return (
            f"Повторный git push {FORK_REMOTE} {LOCAL_BRANCH}:{FORK_MAIN_BRANCH} не удался:\n"
            f"{out.strip()}"
        )
    return None


def push_to_rezerv() -> Optional[str]:
    """Push master to the fork's backup branch (rezerv).

    ``rezerv`` is maintained as a copy of ``main``: after ``main`` is
    updated, the same commit is mirrored to ``rezerv``.  If ``rezerv`` moved
    on its own, a normal push is rejected; re-fetch and force-with-lease so
    the backup stays a faithful copy of ``main``.
    """
    code, out = run_capture(
        ["git", "push", FORK_REMOTE, f"{LOCAL_BRANCH}:{FORK_BACKUP_BRANCH}"]
    )
    if code == 0:
        return None
    fetch_code, _ = run_capture(["git", "fetch", FORK_REMOTE])
    if fetch_code != 0:
        return (
            f"git fetch {FORK_REMOTE} не удался после отклонённого push в {FORK_BACKUP_BRANCH}:\n"
            f"  Команда для повторения: git push {FORK_REMOTE} {LOCAL_BRANCH}:{FORK_BACKUP_BRANCH}"
        )
    code, out = run_capture(
        ["git", "push", "--force-with-lease", FORK_REMOTE, f"{LOCAL_BRANCH}:{FORK_BACKUP_BRANCH}"]
    )
    if code != 0:
        return (
            f"Повторный git push {FORK_REMOTE} {LOCAL_BRANCH}:{FORK_BACKUP_BRANCH} не удался:\n"
            f"{out.strip()}"
        )
    return None


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main(argv: List[str]) -> int:
    if "--help" in argv or "-h" in argv:
        print(__doc__)
        return 0

    # Never run two syncs at once (the daily cron plus a manual run).  A
    # lock left by a killed run is stale: when the owner PID is gone, the
    # lock is removed and the sync continues.
    lock = REPO_ROOT / ".sync-lock"
    if lock.exists():
        alive = False
        try:
            pid = int(lock.read_text(encoding="utf-8").strip() or "0")
        except (OSError, ValueError):
            pid = 0
        if pid > 0:
            try:
                os.kill(pid, 0)
                alive = True
            except ProcessLookupError:
                alive = False
            except OSError:
                alive = True  # permission denied: assume it is still running
        if alive:
            log("Другая синхронизация уже выполняется (.sync-lock существует); выход.")
            return 0
        log_warn("Устаревший .sync-lock (владелец-процесс не запущен); удаляю и продолжаю")
        lock.unlink(missing_ok=True)
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
            write_human_report("Синхронизация остановлена: push в main", [problem])
            return 1
        problem = push_to_rezerv()
        if problem:
            write_human_report("Синхронизация остановлена: push в rezerv", [problem])
            return 1
        log_ok("Всё синхронизировано, main и rezerv актуальны")
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
        write_human_report("Синхронизация остановлена: push в main", [problem])
        return 1
    log_step("Пуш в rezerv (бэкап-копия main)")
    problem = push_to_rezerv()
    if problem:
        write_human_report("Синхронизация остановлена: push в rezerv", [problem])
        return 1

    log_ok("Синхронизация завершена: master слит с апстримом и запушен в main и rezerv")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
