# DeepSeek Harness

[English](README.md) | 中文

本页英文版 — [README.en.md](README.en.md)（在本 fork 中，默认 README 为俄语）。

DeepSeek Harness（`dsh`）是由 [DeepSeek AI](https://deepseek.com) 开发的开源 agent harness（智能体框架）。

它构建于**一切皆插件**的架构之上，由 [Cordis](https://github.com/cordiverse/cordis) 驱动，其设计参见论文 [_A Programming Paradigm for Spatiotemporal Composability_](https://arxiv.org/abs/2608.25512)。

文档：[https://deepseek-harness.github.io/deepseek-harness/](https://deepseek-harness.github.io/deepseek-harness/)

## 俄语本地化

本 fork 为 Web 界面添加了俄语（`pnpm dsh web`）。本地化以语言包插件 [`@deepseek-ai/dsh-client-locale-ru`](packages/extensions/locale-ru/README.zh.md) 的形式提供——`dsh-client-locale` 内核未被修改，整个界面通过数据而非代码改动完成翻译。

效果：

- **Settings → General → Language** 中出现 **Русский** 选项（位于中文和 English 之后）；选择在会话之间保持。
- 主语言为 `ru-RU` 的浏览器直接以俄语打开；页面的 `<html lang>` 跟随选择。
- 客户端界面约 1050 条文案已翻译——按命名空间划分的 33 个词典（聊天、轨迹、设置、工作区等）；未覆盖的命名空间沿 `ru → en` 链自动回退到英语。
- 该包通过 `packages/bundle/web-app/cordis.patch.yml` 花名册中的一行挂载：删除该行，语言即消失；通过 `ctx.locale.register(ns, 'ru', dict)` 添加自己的词典，即可覆盖新命名空间。

详见[该包的 README](packages/extensions/locale-ru/README.zh.md)。

## 开发者预览

DeepSeek Harness 处于 _开发者预览_ 阶段，正在快速迭代。**未来将出现破坏兼容性的变更。**

运行本项目前，请阅读[安全说明](SAFETY.zh.md)。

<a id="run"></a>

## 运行

### 使用脚本安装

如需在 Ubuntu、Debian、Arch Linux、Astra Linux 和 Windows 上从源码自动安装，请使用通用脚本 [`DeepSeek-install.py`](DeepSeek-install.py)（Python 3，仅标准库）：

```sh
python3 DeepSeek-install.py install
```

脚本自行检查环境、安装缺失的依赖、将仓库克隆到 `~/.dsh/source`、执行 `pnpm install` 和 `pnpm run build`，然后打印启动命令。

内置医生（doctor）可以发现并自动修复大多数环境问题：

```sh
python3 DeepSeek-install.py doctor --fix
```

医生会考虑 Astra Linux 的特性：该系统自带的 `npm` 比所需版本更旧，此时它会建议从官方 NodeSource 发行版安装 Node.js，而不是使用发行版仓库中的软件包。详见[脚本文档](docs/user/guide/install.zh.md)。

### 通过 `npm` 运行

安装 `Node.js`，然后运行：

```sh
npx @deepseek-ai/dsh web
```

该命令默认会在 `http://127.0.0.1:3080` 启动 Web UI，本机启动时还会用默认浏览器打开页面。通过 SSH 启动时只打印宿主机 URL，因为本地转发地址由 SSH 客户端或编辑器持有。传入 `--no-open` 可仅运行服务器而不打开浏览器。详见 [Web UI 指南](docs/user/guide/index.zh.md)。

<a id="run-from-source"></a>

### 从源码运行

如需从仓库源码运行：

```sh
git clone https://github.com/maksim9510/DeepSeek-Harnes.git
cd DeepSeek-Harnes
pnpm install
pnpm run build
pnpm dsh web
```

`pnpm run build` 会准备仓库产物。`pnpm dsh web` 会直接使用这些已构建产物，不会重新构建。

**重要：** pnpm 版本固定在 `package.json` 中（`packageManager: pnpm@11.7.0`），请通过 Corepack 运行——使用 `corepack pnpm …`，或在系统上执行一次 `corepack enable`，之后裸 `pnpm` 也会经由 Corepack 解析。低于 10 的全局 pnpm 无法理解 `pnpm-workspace.yaml` 中的 `overrides`：它会悄悄重写 `pnpm-lock.yaml`，随后 `pnpm install` 会因 frozen lockfile 错误而失败。同步脚本 `python3 DeepSeek-sync.py` 会识别这种被重写的锁文件并自动恢复。

## 社区与支持

- 通过 [GitHub Discussions](https://github.com/deepseek-ai/deepseek-harness/discussions) 提交反馈或 bug 报告。
- 为你的插件仓库添加 [`dsh-plugin`](https://github.com/topics/dsh-plugin) 话题，便于被发现。
- 欢迎加入 DeepSeek Harness 企微群：扫码添加企微小助手并填写入群问卷，完成后小助手会邀请你入群。

<table>
  <thead>
    <tr>
      <th align="center">企微小助手</th>
      <th align="center">入群问卷</th>
      <th align="center">微信公众号</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td align="center"><img src="https://cdn.deepseek.com/harness/readme/community-wecom-assistant.png" alt="DeepSeek Harness 企微小助手二维码" width="180" height="180"></td>
      <td align="center"><a href="https://trtgsjkv6r.feishu.cn/share/base/form/shrcnIt5twSVdLGD52KJBckGCgg"><img src="https://cdn.deepseek.com/harness/readme/community-wecom-survey.png" alt="DeepSeek Harness 入群问卷二维码" width="180" height="180"></a></td>
      <td align="center"><img src="https://cdn.deepseek.com/harness/readme/community-wechat-official-account.png" alt="DeepSeek Harness 团队微信公众号二维码" width="180" height="180"></td>
    </tr>
  </tbody>
</table>

## 参与贡献

参见 [CONTRIBUTING.zh.md](CONTRIBUTING.zh.md)。

## 开发

请先阅读[开发指南](docs/development.zh.md)与[架构文档](docs/architecture.zh.md)。

面向 agent：请遵循 [AGENTS.md](AGENTS.md)。

## 许可证

[MIT](LICENSE)

第三方依赖及其许可证见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
