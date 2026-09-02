# Agent Note: universal Python installer with a doctor

Status: implemented

English | [中文](2026-09-01-universal-python-installer-with-doctor.zh.md)

## Problem

The repository has no installer: the earlier `scripts/install.sh` was removed by the [source-run-without-managed-installer decision](../simplification/2026-08-10-source-run-without-managed-installer.md), and the root README documents manual steps (`git clone`, `pnpm install`, `pnpm run build`). A fresh user on a supported distribution has to assemble Node.js, Corepack, pnpm, and system packages by hand, and a broken environment gives no diagnosis beyond the raw toolchain error. Astra Linux is Debian-based but ships an npm older than the project toolchain needs, which the manual steps do not mention.

## Decision

The repository ships a universal installer as a single stdlib-only Python 3 script, `DeepSeek-install.py` at the repository root, covering Ubuntu, Debian, Arch Linux, Astra Linux, and Windows. It bootstraps the pnpm toolchain (Corepack through npm, the pinned pnpm through `corepack prepare`, the bare `pnpm` shim through `corepack enable`), clones the repository into `~/.dsh/source`, runs `pnpm install` and `pnpm run build`, creates an empty `.env`, and prints the launch command. The install is non-interactive and never runs `curl | sh` installers; system packages are installed only through the distro package manager, and install's bootstrap pass restricts auto-repair to the pnpm toolchain checks.

A built-in `doctor` command probes the environment and reports each problem with the exact fix command. With `--fix` it applies the repairs that are safe to run automatically and re-probes to confirm each repair landed:

- A missing Corepack with npm available: Corepack is installed through `npm install -g corepack`; a missing npm still needs the Node.js reinstall decision.
- A pnpm version different from the pin: `corepack prepare pnpm@11.7.0 --activate` downloads and activates the pinned pnpm.
- A bare `pnpm` shim missing or whose version differs from the pinned one (a standalone pnpm older than 10 does not read the workspace `overrides` and silently rewrites the lockfile; a newer one refuses to switch to the pin under Corepack and fails the build's nested `pnpm --filter …` calls): the shim is created or repointed at Corepack in place, and a root-owned directory is reported with the exact `sudo corepack enable pnpm` command.
- A lockfile out of sync with `pnpm-workspace.yaml` (pnpm's `ERR_PNPM_LOCKFILE_CONFIG_MISMATCH`): the lockfile is regenerated with `pnpm install --no-frozen-lockfile --lockfile-only`, retried once.
- Missing distro packages: installed through `apt-get` / `pacman` / `winget` per platform.

On Astra Linux the doctor detects the distro npm older than the npm baseline bundled with Node.js 22 and reports that Node.js must come from the official NodeSource distribution; that repair is a reinstall decision and is never applied automatically.

The doctor report is available as JSON (`doctor --json`) for scripting. The Web UI launch uses the Corepack-resolved pnpm (`corepack pnpm`) so an old global shim never breaks the build.

## Decision: upstream synchronization

The repository also ships `DeepSeek-sync.py`, which merges `origin/master` into the fork's `master` and pushes to the fork's `main`. The sync repairs the checkout layout automatically: a fresh `git clone` of the fork — one `origin` remote pointing at the fork, checked out on the fork's `main`, no local `master` — is brought to the sync layout in place (a local `master` is created at the fork's `main`, `origin` is repointed at upstream `deepseek-ai/deepseek-harness`, and the fork is added as `personal`), and `master` is fast-forwarded onto the fork's `main` whenever the fork moved ahead on its own. The fork's local work (Russian README, ru web localization, the installer, the lockfile fix) is protected through a marker audit run before and after the merge; a merge whose result fails the audit is rolled back to the pre-merge commit and never pushed. The sync auto-repairs what it can decide safely — lockfile drift and ru dictionary keys added or removed by upstream, parsed from the typecheck output over up to three repair rounds, with translations from a built-in table and the upstream English text as fallback — and gates the push on `pnpm install --frozen-lockfile` plus `pnpm run typecheck`. A problem the script cannot decide stops it with exit 1 and a `sync-needs-human.txt` report carrying the exact recovery commands. A daily run at 02:00 is installed as `/etc/cron.d/deepseek-sync` and appends to `sync.log`.

## Alternatives considered

**Bash installer.** Rejected: the old `scripts/install.sh` was removed because the managed-installer lifecycle duplicated the package-manager lifecycle, and a new Bash installer would not run on Windows.

**Reintroduce the managed `current`/staging layout.** Rejected: that lifecycle is what the archived installer owned, and the source-run decision removed it deliberately. The new installer owns no upgrade state; it only prepares a plain checkout.

**Install dependencies into a global prefix.** Rejected: the installer writes only inside the user home and the checkout, so uninstall is deleting the directory.

## Consequences

A fresh user on a supported distribution can install with `python3 DeepSeek-install.py install` and diagnose a broken environment with `python3 DeepSeek-install.py doctor --fix`. The installer repairs the fork's lockfile mismatch automatically, which the manual steps would surface only as a pnpm error. The doctor is a decision point, not a package manager: repairs that need a user decision (Node.js reinstall on Astra Linux, proxy configuration) are reported with commands, never guessed.

The script is stdlib-only Python 3.8+, so it runs before Node.js exists. Its platform detection is best-effort: an unrecognized Linux distribution falls back to a generic report instead of failing.
