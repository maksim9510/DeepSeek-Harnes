# Agent Note：安装器按远端身份更新检出

Status: implemented

[English](2026-09-21-installer-update-by-remote-identity.md) | 中文

## 问题

`DeepSeek-install.py install --dir <checkout>` 使用 `git pull --ff-only` 更新已有检出。在本 fork 的同步布局中，该命令必然失败：`origin` 是上游（`deepseek-ai/deepseek-harness`，分支 `master`），而本地分支 `master` 跟踪的是 `origin/main`，因此 git 报告找不到其配置所指定的引用。结果是安装器拒绝对已存在的检出执行构建，而推进该检出的唯一途径是本 fork 自己的更新路径 `DeepSeek-sync.py`。

## 决定

更新按仓库 URL 而非名称或本地分支的跟踪配置来识别要推进的远端。它选择 `github.com` 上 `owner/repo` 与目标仓库一致、且优先为 `origin` 的远端，抓取该远端，并快进到本 fork 发布的分支；若不存在则回退到远端自身的 `HEAD`，再回退到当前检出的分支。

本 fork 的布局将该远端命名为 `personal`；fork 的全新克隆将其命名为 `origin`；两种情况都无需特例即可解析。URL 不具备 GitHub 身份，或检出中没有匹配远端时，保留原有的普通 `pull` 行为。

若检出含有远端没有的提交，则保持不动。安装器打印快进失败信息以及解决所需的命令，而不是在本地工作之上强制合并。

本决定细化了[通用 Python 安装器](../feature/2026-09-01-universal-python-installer-with-doctor.zh.md)的更新步骤，后者拥有安装器的整体范围；远端布局本身仍由[同步适配循环](2026-09-07-sync-locale-adaptation-loop.zh.md)拥有。

## 考虑过的替代方案

**配置跟踪引用。** 把 `branch.master.merge` 指向本 fork 的 `main` 可以让 `pull` 工作，但这会改写由 `DeepSeek-sync.py` 拥有的同步布局，而且每次克隆都要重做。

**按名称从 `personal` 拉取。** 只在同步布局中正确；fork 的全新克隆没有 `personal` 远端。

**拒绝更新，让用户去运行 `DeepSeek-sync.py`。** 这会让 `install` 在本 fork 发布的布局上无法完成，而该布局正是要修复的缺陷。

**不带 `--ff-only` 的 `git merge`。** 会在本地提交之上静默合并，把一次更新变成未经审阅的改动。

## 影响

`install --dir` 在两种布局下都能推进检出。把该更新描述为 `git pull` 的部署文档已不再符合安装器的行为，随本改动一并更正。
