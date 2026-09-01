# Install DeepSeek Harness with the installer script

English | [中文](install.zh.md)

[`DeepSeek-install.py`](../../../DeepSeek-install.py) is a universal installer for Ubuntu, Debian, Arch Linux, Astra Linux, and Windows. It is a single Python 3 script that uses only the standard library, so it runs on any system Python before Node.js exists.

## What the installer does

The `install` command checks the environment, installs missing system dependencies, clones the repository into `~/.dsh/source`, runs `pnpm install` and `pnpm run build`, creates an empty `.env` file for your API key, and prints the command that starts the Web UI.

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

The doctor checks Python, Node.js, npm, Corepack, pnpm, git, system packages, the checkout state, installed dependencies, build artifacts, the API key, and network reachability. The report is also available as JSON for scripting:

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

- A pnpm older than the pinned version: Corepack activates the pinned pnpm.
- A lockfile out of sync with `pnpm-workspace.yaml`: the lockfile is regenerated with `pnpm install --no-frozen-lockfile --lockfile-only`.
- Missing distro packages: they are installed through the system package manager.

## Synchronize with upstream

[`DeepSeek-sync.py`](../../../DeepSeek-sync.py) merges new commits from the upstream repository (`deepseek-ai/deepseek-harness`) into the fork and pushes `master` to the fork's `main` when everything passes:

```sh
python3 DeepSeek-sync.py
```

The sync protects the fork's local work — the Russian README, the Russian web localization, the installer, and the lockfile fix — through a marker audit before and after the merge. It auto-repairs what it can decide safely: a lockfile drifted by the merge, and ru dictionary keys added or removed by upstream (parsed from the typecheck output, up to three repair rounds, with translations from its built-in table and the upstream English text as fallback). It verifies the result with `pnpm install --frozen-lockfile` and `pnpm run typecheck` before pushing.

Anything that needs a decision stops the sync with exit code 1, rolls the merge back to the pre-merge commit, and writes `sync-needs-human.txt` with the exact recovery commands. A daily run at 02:00 is installed through `/etc/cron.d/deepseek-sync` and appends its output to `sync.log` in the repository root.
