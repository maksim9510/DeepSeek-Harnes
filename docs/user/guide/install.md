# Install DeepSeek Harness with the installer script

English | [中文](install.zh.md)

[`DeepSeek-install.py`](../../../DeepSeek-install.py) is a universal installer for Ubuntu, Debian, Arch Linux, Astra Linux, and Windows. It is a single Python 3 script that uses only the standard library, so it runs on any system Python before Node.js exists.

## What the installer does

The `install` command checks the environment, bootstraps the pnpm toolchain — installs Corepack through npm when it is missing, downloads and activates the pinned `pnpm@11.7.0` through `corepack prepare`, and creates or repoints the bare `pnpm` shim — then installs missing system dependencies, clones the repository into `~/.dsh/source`, runs `pnpm install` and `pnpm run build`, creates an empty `.env` file for your API key, and prints the command that starts the Web UI.

```sh
python3 DeepSeek-install.py install
```

The install runs non-interactively. On a system that already has the checkout, it pulls the latest changes instead of cloning again.

## The doctor

The `doctor` command probes the environment and reports problems with the exact command that fixes each one. With `--fix`, it applies the repairs that are safe to run automatically.

```sh
python3 DeepSeek-install.py doctor
python3 DeepSeek-install.py doctor --fix
```

The doctor checks Python, Node.js, npm, Corepack, pnpm, git, system packages, the checkout state, installed dependencies, build artifacts, the API key, and network reachability. It also inspects the bare `pnpm` on PATH: a standalone pnpm whose version differs from the pinned one breaks the project in both directions — older than 10 it silently rewrites `pnpm-lock.yaml` without the `pnpm-workspace.yaml` overrides, newer it refuses to switch to the pinned version under Corepack and fails the nested `pnpm --filter …` calls in `pnpm run build`. The doctor flags such a shim and, on `--fix`, repoints it at Corepack. The report is also available as JSON for scripting:

```sh
python3 DeepSeek-install.py doctor --json
```

### Astra Linux and the old npm

Astra Linux is Debian-based but ships an npm older than the project toolchain needs. The doctor detects this and reports that Node.js must come from the official NodeSource distribution instead of the distro package. The repair is a reinstall decision, so the doctor never performs it automatically — it prints the NodeSource setup link and asks you to re-run the doctor afterwards.

## Options

| Flag | Meaning |
|---|---|
| `--repo URL` | Repository to clone (default: `https://github.com/maksim9510/DeepSeek-Harnes.git`) |
| `--dir PATH` | Install directory (default: `~/.dsh/source`) |
| `--skip-build` | Do not run `pnpm run build` during install |
| `--fix` | Doctor: apply safe repairs automatically |
| `--json` | Doctor: print results as JSON |

## What the installer repairs automatically

- A missing Corepack, when npm is available: Corepack is installed with `npm install -g corepack`.
- A pnpm version different from the pin: `corepack prepare pnpm@11.7.0 --activate` downloads and activates the pinned pnpm.
- A bare `pnpm` shim missing or whose version differs from the pinned one (a standalone pnpm older than 10 rewrites the lockfile; a newer one refuses to switch under Corepack and fails the build's nested pnpm calls): the shim is created or repointed at Corepack; when its directory is root-owned, the exact `sudo corepack enable pnpm` command is reported.
- A lockfile out of sync with `pnpm-workspace.yaml`: the lockfile is regenerated with `pnpm install --no-frozen-lockfile --lockfile-only`.
- Missing distro packages: they are installed through the system package manager.

## Synchronize with upstream

[`DeepSeek-sync.py`](../../../DeepSeek-sync.py) merges new commits from the upstream repository (`deepseek-ai/deepseek-harness`) into the fork and pushes `master` to the fork's `main` when everything passes:

```sh
python3 DeepSeek-sync.py
```

The sync repairs the checkout layout automatically: a fresh `git clone` of the fork — one `origin` remote pointing at the fork, checked out on `main`, no local `master` — is brought to the sync layout in place (a local `master` is created at the fork's `main`, `origin` is repointed at upstream, and the fork is added as `personal`), and `master` is fast-forwarded onto the fork's `main` whenever the fork moved ahead on its own. Run the sync from the same checkout every time; the sync script is part of the fork, so pull the fork's `main` first to get the latest version of the script itself.

The sync protects the fork's local work — the Russian README, the Russian web localization, the installer, and the lockfile fix — through a marker audit before and after the merge. It auto-repairs what it can decide safely: a lockfile drifted by the merge, and ru dictionary keys added or removed by upstream (parsed from the typecheck output, up to three repair rounds, with translations from its built-in table and the upstream English text as fallback). It verifies the result with `pnpm install --frozen-lockfile` and `pnpm run typecheck` before pushing.

Anything that needs a decision stops the sync with exit code 1, rolls the merge back to the pre-merge commit, and writes `sync-needs-human.txt` with the exact recovery commands. A daily run at 02:00 is installed through `/etc/cron.d/deepseek-sync` and appends its output to `sync.log` in the repository root.
