# Agent Note：包树之外部署的网页搜索垫片

Status: implemented

[English](2026-09-21-deployed-web-search-shim.md) | 中文

## 问题

`web-search-deepseek` 提供方向 `baseURL + /messages` 发送一个 Anthropic Messages 请求，并从应答中读取 `web_search_tool_result` 区块。本分支配置的提供方是第三方 OpenAI 兼容网关，其搜索以请求插件方式运行并返回 `url_citation` 注解；把提供方的 `baseURL` 指向该网关不会产生结果区块，因此网页搜索失败。完全不提供服务端搜索的提供方也会以同样方式失败，而本地端点可回退到的无密钥 HTML 引擎，在回应脚本客户端时经常给出机器人检查，单靠其中任何一个并不可靠。

## 决定

本分支把垫片作为分支本地源码放在 `tools/dsh-search-shim`，部署在包树之外，并由[安装器](../../../../DeepSeek-install.py)负责其部署。

`server.mjs` 按提供方期望的格式作答，并拥有无凭据引擎（依次为 DuckDuckGo HTML、Bing、DuckDuckGo Lite）。`provider-route.mjs` 按请求解析 Agent 当前使用的提供方：从 `settings.yaml` 读取 `agent-default-model.provider`，从 `llm-pi-ai.providers.<provider>` 取 `baseURL`、`apiKeyEnv` 与模型，再从 `.credentials.yaml` 的 `refs.<apiKeyEnv>` 读取密钥。把路由映射到凭据的是路由的 `apiKeyEnv` 字段，而非其提供方名称。

检索方式取决于解析出的路由。对已知搜索插件可用的网关先发起请求，使用 `exa` 引擎，并把其 `url_citation` 注解转换为结果区块。对已知不提供服务端搜索的提供方，跳过该请求直接使用无密钥引擎。其他任何提供方则尝试受门控的默认引擎。每条路由都会回退到无密钥引擎，两个层都会记录结果以及跳过或未命中密钥提供方的原因，因此日志会显示实际作答的是哪条检索路径。`DSH_SEARCH_SHIM_PROVIDER` 可为某次部署强制指定提供方，这也是在不修改设置的情况下检验回退层的方式。

安装器把两个模块复制到 `~/.dsh/search-shim`，写入一个 systemd 用户单元（其 `ExecStart` 指向解析出的 `node` 绝对路径），启用并重启该单元，并在报告成功前等待健康端点就绪。`doctor` 报告同样的状态，`doctor --fix` 会从检出重新部署。没有 systemd 用户管理器的机器会得到文件以及直接运行垫片的命令。检出不包含 `tools/dsh-search-shim` 并非缺陷：该项检查会被跳过，安装继续，因为 Web UI 在无网页搜索时仍可工作。

同步脚本通过 `PROTECTED_MARKERS` 中的条目保护垫片：两个模块各一条，以及命名它们的安装器常量一条；这样，删除它们的合并会停止同步，而不是悄悄丢掉分支的搜索能力。

## 考虑过的替代方案

**恢复已移除的 `packages/web/web-search-routerai` 提供方。** 已否决：`packages/` 下的软件包属于上游的树，因此下一次同步要么会丢失它，要么每次都需要冲突决策，而本分支当初是有意停用该包的。部署式垫片不需要软件包位置，同步按标记保护它。

**把 `web-search-deepseek.baseURL` 直接指向网关。** 已否决：该网关的 Messages 路由不执行服务端搜索——它返回提供方无法读取的 `tool_use` 区块——因此提供方会抛出 `WEB_PROVIDER_ERROR` 而不是返回结果。

**从 `tools/dsh-search-shim` 内的脚本部署。** 已否决：`DeepSeek-install.py` 是本分支的安装入口且是受保护的标记，第二个脚本会重复部署路径并与之产生偏差。

**把垫片作为已发布软件包。** 已否决：它是一个部署本地端点，没有库消费者，打包它只会增加一个唯一职责是被复制到固定路径的工作区成员。

## 后果

执行 `python3 DeepSeek-install.py install` 后网页搜索即可工作，无需单独的设置步骤；由于路由按请求解析，垫片会跟随 Agent 切换到的提供方，无需重启。`provider-route.mjs` 中的检索表是模块导入，因此修改它需要重启单元；而配置在请求时读取，不需要。

垫片依赖网关的 OpenAI 兼容插件契约以及无密钥引擎的标记，这两者都不稳定。网关侧的变化会表现为日志中的未命中与回退而非报错，而无密钥层正是密钥提供方失败时仍能作答的原因。提供方路由解析覆盖本部署所写入的块映射与流映射子集；`settings.yaml` 中的异常形状会解析为缺失路由并记录原因，而不是让搜索失败。

部署位于 Harness home 而非检出目录，因此它能跨越同步和检退回退，但不能跨越重装；安装器会重建它，`doctor --fix` 会修复被删除的部署。
