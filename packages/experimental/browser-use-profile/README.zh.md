---
description: "为 Web profile 添加面向模型的浏览器自动化，使 agent 能够打开、点击并读取正在运行 GUI 的控制台错误。"
kind: "package-bundle"
---

# @deepseek-ai/dsh-experimental-browser-use-profile

[English](README.md) | 中文

## 概述

`dsh-experimental-browser-use-profile` 是已发布的实验性组合包，为 Session 提供真正的浏览器自动化工具，并让它们指向用户正在查看的 Web GUI。选用它会挂载 [`@deepseek-ai/dsh-browser-use`](../../browser-use/browser-use/README.zh.md) 并搭配一个 Playwright MCP 提供方，同时把携带 token 的 GUI URL 发布为受管 shell 变量，使全新的浏览器 profile 能够通过认证。dsh 安装将其作为可选组合包发布；本 fork 的安装器会为 `web` profile 打开它，因此安装后无需额外步骤即可使用这些工具。

## 目录

- [使用此包](#use-this-package)
- [了解实现](#understand-the-implementation)
- [延伸阅读](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与待办工作](#known-limitations-and-deferred-work)
- [开发者说明](#dev-note)

-----

<a id="use-this-package"></a>
## 使用此包

### 安装到 profile

将组合包添加到已初始化的 `web` profile：

```sh
dsh plugin --profile web add @deepseek-ai/dsh-experimental-browser-use-profile
```

用 `dsh plugin --profile web remove @deepseek-ai/dsh-experimental-browser-use-profile` 移除时，浏览器工具与 GUI URL 变量会一同移除。

### 你能得到什么

每个 Session 都会获得 Playwright MCP 浏览器工具。由于该组合包同时发布 `DSH_WEB_AUTH_URL`，Session 可以驱动正在运行的 GUI——打开右侧浏览器面板、新增标签页、点击，并读取控制台错误——而不是仅对无法看到的页面进行推理。浏览器二进制为 Chromium；本 fork 的安装器会准备所固定的提供方所需的版本。

-----

<a id="understand-the-implementation"></a>
## 了解实现

<details>
<summary>实现内部细节——点击展开</summary>

该包包含两个运行时部分。[`cordis.patch.yml`](cordis.patch.yml) 是作用于 `dsh-web-app` 的有序 patch：它依次插入 `@deepseek-ai/dsh-browser-use`、单个提供方行 `@deepseek-ai/dsh-experimental-browser-use-playwright-mcp`，以及本包自身的胶水行。提供方槽位是独占的——第二次注册时 `ctx.browserUse.register` 会抛出异常——因此该 patch 只携带一个提供方，并由 `tests/profile.spec.ts` 断言这一点。

[`src/index.ts`](src/index.ts) 是胶水代码。它注册一个 `ctx.shellEnv` 贡献者，声明 `DSH_WEB_AUTH_URL`，其 resolver 在每次工具执行时组合 `connection.authenticatedUrl(http://127.0.0.1:<port>)`；并注册一个 `systemPrompt` 段落，说明打开该变量是浏览器访问 GUI 的方式。两个贡献都 `inject` 而非 require 其服务，因此没有 `dsh-web-app` 的 profile 启动时既无变量也无该段落；resolver 仅在 Web server 与 connection 服务同时存在时才发布该变量，因此绝不会以承诺携带启动 token 的名称发布未认证的源地址。启动 token 仅存在于进程内存中，因此该值每次重新解析且从不持久化。

| 文件 | 职责 |
|---|---|
| [`cordis.patch.yml`](cordis.patch.yml) | 有序 Web patch：能力服务、一个提供方、本胶水 |
| [`src/index.ts`](src/index.ts) | `DSH_WEB_AUTH_URL` 贡献者与浏览器 surface 提示词段落 |
| [`tests/profile.spec.ts`](tests/profile.spec.ts) | 断言 manifest、行顺序与提供方独占性 |
| — | 不发布运行时 invariant companion；`dsh-browser-use` 拥有的独占注册在出现第二个提供方时已会显式失败。 |

</details>

-----

<a id="further-exploration"></a>
## 延伸阅读

- [实验性包](../README.zh.md) —— 孵化状态与发布策略。
- [Browser use](../../browser-use/browser-use/README.zh.md) —— 本组合包挂载的独占提供方注册表。
- [Playwright MCP 提供方](../browser-use-playwright-mcp/README.zh.md) —— 所固定的提供方、其 launch/attach 模式及提示词注意事项。
- [Web 组合包](../../bundle/web-app/README.zh.md) —— 本 patch 所扩展的稳定浏览器层。

-----

<a id="model-experience"></a>
## 模型体验

直接相关。正是该组合包为 Session 提供浏览器工具，因此它会把工具 schema 与结果加入请求，并新增一个提示词段落和一个受管 shell 变量。

#### KV Cache 影响

该提示词段落是位于 `WEB_SURFACE` 顺序的静态文本，因此它是 Session 每个 Step 中稳定的前缀内容。工具 schema 来自提供方，同样稳定。变量值仅在进程重启时变化。

## 已知限制与待办工作

<a id="known-limitations-and-deferred-work"></a>

- **GUI 的右侧面板由外部驱动。** 浏览器工具驱动的是组装后的页面，而非面板 iframe 内部：访问 iframe 内容需要目标专属的 CDP 通道，而 [`ui-sidebar-browser`](../../client/ui-sidebar-browser/README.zh.md) 未实现它。面板渲染内容的测试通过承载它的页面完成。
- **launch 模式是隔离的。** 提供方传入 `--isolated`，因此 MCP 浏览器使用内存中的 profile，它铸造的任何 cookie 都会随提供方一起消失；每个 Session 都会通过 `DSH_WEB_AUTH_URL` 重新认证。
- **Chromium 由安装器准备，而非本包。** 缺少二进制时只会让单个工具调用以清晰的错误降级，绝不会导致 MCP 启动或 Session 创建失败。
- **在提示词组合中 `format` 需要谨慎。** 让浏览器工具名留在 `toolOrder` 的 `<unlisted-tools>` 之下；显式命名它们可能破坏没有浏览器连接的 Session 的提示词组装。
- **默认 headless。** 打过 patch 的提供方以 headless 运行；需要可见窗口的组合可以为 `browser-provider` 行覆盖 `headless`。

<a id="dev-note"></a>
### 开发者说明

<details>
<summary>面向维护者的工作背景——点击展开</summary>

该组合包是本 fork 的接缝：它把浏览器启用逻辑收敛到一个实验性包加一个安装器步骤，使 `packages/bundle/web-app/cordis.patch.yml` 与上游保持完全一致并顺利同步。

</details>
