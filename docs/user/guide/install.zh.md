# 使用安装脚本安装 DeepSeek Harness

[English](install.md) | 中文

[`DeepSeek-install.py`](../../../DeepSeek-install.py) 是一个通用安装脚本，支持 Ubuntu、Debian、Arch Linux、Astra Linux 和 Windows。它只是一个 Python 3 脚本，仅使用标准库，因此在 Node.js 存在之前就可以在任何系统 Python 上运行。

## 安装脚本做什么

`install` 命令检查环境、安装缺失的系统依赖、将仓库克隆到 `~/.dsh/source`、运行 `pnpm install` 和 `pnpm run build`、为你的 API 密钥创建空的 `.env` 文件，并打印启动 Web UI 的命令。

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

医生检查 Python、Node.js、npm、Corepack、pnpm、git、系统软件包、检出状态、已安装依赖、构建产物、API 密钥和网络可达性。报告也可以 JSON 形式输出以便脚本使用：

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

- 比固定版本更旧的 pnpm：Corepack 激活固定的 pnpm。
- 与 `pnpm-workspace.yaml` 不同步的锁文件：使用 `pnpm install --no-frozen-lockfile --lockfile-only` 重新生成锁文件。
- 缺失的发行版软件包：通过系统软件包管理器安装。
