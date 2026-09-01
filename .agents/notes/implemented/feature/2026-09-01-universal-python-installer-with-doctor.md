# Agent Note: universal Python installer with a doctor

Status: implemented

English | [中文](2026-09-01-universal-python-installer-with-doctor.zh.md)

## Problem

The repository has no installer: the earlier `scripts/install.sh` was removed by the [source-run-without-managed-installer decision](../simplification/2026-08-10-source-run-without-managed-installer.md), and the root README documents manual steps (`git clone`, `pnpm install`, `pnpm run build`). A fresh user on a supported distribution has to assemble Node.js, Corepack, pnpm, and system packages by hand, and a broken environment gives no diagnosis beyond the raw toolchain error. Astra Linux is Debian-based but ships an npm older than the project toolchain needs, which the manual steps do not mention.

## Decision

The repository ships a universal installer as a single stdlib-only Python 3 script, `DeepSeek-install.py` at the repository root, covering Ubuntu, Debian, Arch Linux, Astra Linux, and Windows. It clones the repository into `~/.dsh/source`, runs `pnpm install` and `pnpm run build`, creates an empty `.env`, and prints the launch command. The install is non-interactive and never runs `curl | sh` installers; system packages are installed only through the distro package manager.

A built-in `doctor` command probes the environment and reports each problem with the exact fix command. With `--fix` it applies the repairs that are safe to run automatically and re-probes to confirm each repair landed:

- pnpm older than the pinned version: Corepack activates `pnpm@11.7.0`; `corepack enable` EACCES on a root-owned bin directory is reported with the `sudo corepack enable` alternative.
- A lockfile out of sync with `pnpm-workspace.yaml` (pnpm's `ERR_PNPM_LOCKFILE_CONFIG_MISMATCH`): the lockfile is regenerated with `pnpm install --no-frozen-lockfile --lockfile-only`, retried once.
- Missing distro packages: installed through `apt-get` / `pacman` / `winget` per platform.

On Astra Linux the doctor detects the distro npm older than the npm baseline bundled with Node.js 22 and reports that Node.js must come from the official NodeSource distribution; that repair is a reinstall decision and is never applied automatically.

The doctor report is available as JSON (`doctor --json`) for scripting. The Web UI launch uses the Corepack-resolved pnpm (`corepack pnpm`) so an old global shim never breaks the build.

## Alternatives considered

**Bash installer.** Rejected: the old `scripts/install.sh` was removed because the managed-installer lifecycle duplicated the package-manager lifecycle, and a new Bash installer would not run on Windows.

**Reintroduce the managed `current`/staging layout.** Rejected: that lifecycle is what the archived installer owned, and the source-run decision removed it deliberately. The new installer owns no upgrade state; it only prepares a plain checkout.

**Install dependencies into a global prefix.** Rejected: the installer writes only inside the user home and the checkout, so uninstall is deleting the directory.

## Consequences

A fresh user on a supported distribution can install with `python3 DeepSeek-install.py install` and diagnose a broken environment with `python3 DeepSeek-install.py doctor --fix`. The installer repairs the fork's lockfile mismatch automatically, which the manual steps would surface only as a pnpm error. The doctor is a decision point, not a package manager: repairs that need a user decision (Node.js reinstall on Astra Linux, proxy configuration) are reported with commands, never guessed.

The script is stdlib-only Python 3.8+, so it runs before Node.js exists. Its platform detection is best-effort: an unrecognized Linux distribution falls back to a generic report instead of failing.
