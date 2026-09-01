# Agent Note: universal Python installer with a doctor

Status: implemented

[English](2026-09-01-universal-python-installer-with-doctor.md) | 中文

## 问题

仓库没有安装脚本：早期的 `scripts/install.sh` 已被[不使用托管安装器从源码运行的决定](../simplification/2026-08-10-source-run-without-managed-installer.zh.md)移除，根 README 只记录了手动步骤（`git clone`、`pnpm install`、`pnpm run build`）。新用户在受支持的发行版上必须手动组装 Node.js、Corepack、pnpm 和系统软件包，而环境损坏时除了原始工具链报错外没有任何诊断。Astra Linux 基于 Debian，但其自带的 npm 比项目工具链需要的版本更旧，手动步骤没有提及这一点。

## 决定

仓库随附一个通用安装脚本，即仓库根目录下的单个仅标准库 Python 3 脚本 `DeepSeek-install.py`，支持 Ubuntu、Debian、Arch Linux、Astra Linux 和 Windows。它把仓库克隆到 `~/.dsh/source`，运行 `pnpm install` 和 `pnpm run build`，创建空的 `.env`，并打印启动命令。安装以非交互方式运行，从不执行 `curl | sh` 安装器；系统软件包只通过发行版软件包管理器安装。

内置的 `doctor` 命令探测环境，并为每个问题报告确切的修复命令。使用 `--fix` 时，它自动应用安全的修复，并重新探测以确认每次修复都已生效：

- pnpm 比固定版本更旧：Corepack 激活 `pnpm@11.7.0`；当 `corepack enable` 因根用户拥有的 bin 目录报 EACCES 时，会报告 `sudo corepack enable` 替代方案。
- 锁文件与 `pnpm-workspace.yaml` 不同步（pnpm 的 `ERR_PNPM_LOCKFILE_CONFIG_MISMATCH`）：使用 `pnpm install --no-frozen-lockfile --lockfile-only` 重新生成锁文件，重试一次。
- 缺失的发行版软件包：按平台通过 `apt-get` / `pacman` / `winget` 安装。

在 Astra Linux 上，doctor 检测到发行版 npm 比 Node.js 22 自带的 npm 基线更旧，并报告 Node.js 必须来自官方 NodeSource 发行版；该修复需要用户决策，因此从不自动应用。

doctor 报告可以 JSON 形式输出（`doctor --json`）以便脚本使用。Web UI 启动使用 Corepack 解析的 pnpm（`corepack pnpm`），因此旧的全局 shim 永远不会破坏构建。

## 备选方案

**Bash 安装脚本。** 被拒绝：旧的 `scripts/install.sh` 之所以被移除，是因为托管安装器的生命周期与软件包管理器的生命周期重复，而且新的 Bash 安装脚本无法在 Windows 上运行。

**重新引入托管的 `current`/staging 布局。** 被拒绝：该生命周期属于已归档安装器，源码运行决定有意移除了它。新安装器不拥有任何升级状态；它只准备一个普通检出。

**把依赖安装到全局前缀。** 被拒绝：安装器只写入用户主目录和检出目录，因此卸载就是删除该目录。

## 影响

受支持发行版上的新用户可以用 `python3 DeepSeek-install.py install` 安装，并用 `python3 DeepSeek-install.py doctor --fix` 诊断损坏的环境。安装器自动修复 fork 的锁文件不匹配问题，而手动步骤只能以 pnpm 报错的形式暴露该问题。doctor 是决策点，不是软件包管理器：需要用户决策的修复（Astra Linux 上的 Node.js 重装、代理配置）只报告命令，从不猜测。

脚本仅使用 Python 3.8+ 标准库，因此在 Node.js 存在之前即可运行。其平台检测尽力而为：无法识别的 Linux 发行版会回退到通用报告而不是失败。
