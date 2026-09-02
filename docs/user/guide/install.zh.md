# 使用安装脚本安装 DeepSeek Harness

[English](install.md) | 中文

[`DeepSeek-install.py`](../../../DeepSeek-install.py) 是一个通用安装脚本，支持 Ubuntu、Debian、Arch Linux、Astra Linux 和 Windows。它只是一个 Python 3 脚本，仅使用标准库，因此在 Node.js 存在之前就可以在任何系统 Python 上运行。

## 安装脚本做什么

`install` 命令检查环境，搭建 pnpm 工具链——在缺失时通过 npm 安装 Corepack，通过 `corepack prepare` 下载并激活固定的 `pnpm@11.7.0`，创建或重定向裸 `pnpm` shim——然后安装缺失的系统依赖，将仓库克隆到 `~/.dsh/source`，运行 `pnpm install` 和 `pnpm run build`，为你的 API 密钥创建空的 `.env` 文件，并打印启动 Web UI 的命令。

```sh
python3 DeepSeek-install.py install
```

安装以非交互方式运行。如果系统上已有检出，它会拉取最新更改而不是再次克隆。

## 医生（doctor）

`doctor` 命令探测环境并报告每个问题的确切修复命令。使用 `--fix` 时，它会自动应用安全的修复。

```sh
python3 DeepSeek-install.py doctor
python3 DeepSeek-install.py doctor --fix
```

医生检查 Python、Node.js、npm、Corepack、pnpm、git、系统软件包、检出状态、已安装依赖、构建产物、API 密钥和网络可达性。它还检查 PATH 上的裸 `pnpm`：版本与固定版本不同的独立 pnpm 会从两个方向破坏项目——低于 10 会悄悄重写 `pnpm-lock.yaml`（丢失 `pnpm-workspace.yaml` 的 `overrides`），更新则会拒绝在 Corepack 下切换到固定版本，使 `pnpm run build` 中的嵌套 `pnpm --filter …` 调用失败。医生会标记此类 shim，并在 `--fix` 时把它重新指向 Corepack。报告也可以 JSON 形式输出以便脚本使用：

```sh
python3 DeepSeek-install.py doctor --json
```

### Astra Linux 与旧版 npm

Astra Linux 基于 Debian，但其自带的 npm 比项目工具链需要的版本更旧。医生会检测到这一点，并报告 Node.js 必须来自官方 NodeSource 发行版而不是发行版软件包。修复需要用户决策，因此医生从不自动执行——它会打印 NodeSource 安装链接，并要求你在之后重新运行医生。

## 选项

| 标志 | 含义 |
|---|---|
| `--repo URL` | 要克隆的仓库（默认：`https://github.com/maksim9510/DeepSeek-Harnes.git`） |
| `--dir PATH` | 安装目录（默认：`~/.dsh/source`） |
| `--skip-build` | 安装期间不运行 `pnpm run build` |
| `--fix` | 医生：自动应用安全修复 |
| `--json` | 医生：以 JSON 形式输出结果 |

## 安装脚本自动修复什么

- 缺失的 Corepack（当 npm 可用时）：使用 `npm install -g corepack` 安装 Corepack。
- 与固定版本不同的 pnpm：`corepack prepare pnpm@11.7.0 --activate` 下载并激活固定的 pnpm。
- 裸 `pnpm` shim 缺失或版本与固定版本不同（低于 10 的独立 pnpm 重写锁文件；更新的则拒绝在 Corepack 下切换，使构建中的嵌套 pnpm 调用失败）：shim 被创建或重新指向 Corepack；当其目录归 root 所有时，会报告确切的 `sudo corepack enable pnpm` 命令。
- 与 `pnpm-workspace.yaml` 不同步的锁文件：使用 `pnpm install --no-frozen-lockfile --lockfile-only` 重新生成锁文件。
- 缺失的发行版软件包：通过系统软件包管理器安装。

## 与上游同步

[`DeepSeek-sync.py`](../../../DeepSeek-sync.py) 将上游仓库（`deepseek-ai/deepseek-harness`）的新提交合并到 fork，并在一切通过后把 `master` 推送到 fork 的 `main`：

```sh
python3 DeepSeek-sync.py
```

同步会自动修复检出布局：全新的 `git clone` 的 fork——只有一个指向 fork 的 `origin` remote、检出于 `main`、没有本地 `master`——会被原地调整到同步布局（在 fork 的 `main` 上创建本地 `master`、把 `origin` 改指上游、把 fork 添加为 `personal`），并且只要 fork 自行前进了，`master` 就会快进到 fork 的 `main`。每次都从同一个检出运行同步；同步脚本属于 fork，因此请先拉取 fork 的 `main`，以获得脚本自身的最新版本。

同步通过合并前后的标记审计保护 fork 的本地工作——俄语 README、俄语 Web 本地化、安装脚本和锁文件修复。它自动修复可以安全决定的问题：合并造成的锁文件漂移，以及上游新增或删除的 ru 词典键（从 typecheck 输出解析，最多三轮修复，翻译来自内置表并以英文原文作为后备）。它在推送之前用 `pnpm install --frozen-lockfile` 和 `pnpm run typecheck` 验证结果。

任何需要决策的问题都会使同步以退出码 1 停止，先把合并回滚到合并前提交，并写入 `sync-needs-human.txt`，其中包含确切的恢复命令。每日 02:00 的定时运行通过 `/etc/cron.d/deepseek-sync` 安装，并把输出追加到仓库根目录的 `sync.log`。
