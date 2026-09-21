# DSH 网络搜索垫片

[English](README.md) | 中文

[`web-search-deepseek`](../../packages/web/web-search-deepseek) 是 Harness 的搜索提供方：它向 `baseURL + /messages` 发送一个 Anthropic Messages 请求，并读取返回的 `web_search_tool_result` 区块。把该提供方的 `baseURL` 直接指向公共网关是行不通的，因为搜索必须在服务端执行，而该提供方期望的是一个普通对话补全永远不会产生的结果区块。

本目录存放填补这一空缺的垫片：一个无依赖的 Node HTTP 服务器，它按提供方期望的格式作答，并自行执行真正的检索。它是分支本地工具而非已发布软件包，因此位于 `packages/` 之外，上游同步永远不会合并到它。

## 它的作用

对每个请求，垫片都会解析 Agent 当前使用的提供方，在可行时向该提供方请求搜索，否则回退到无需凭据的引擎。

| 提供方 | 检索方式 |
|---|---|
| `routerai` | 网关原生的 `web` 插件配合 `exa` 引擎；命中结果从 `url_citation` 注解中读取。 |
| `promee`、`deepseek` | 不存在服务端搜索，因此垫片直接转到无密钥引擎，而不是发出一个不可能成功的请求。 |
| 其他任何提供方 | 尝试受门控的默认插件引擎；未命中则回退到无密钥引擎。 |

无密钥层依次运行 DuckDuckGo HTML、Bing，然后 DuckDuckGo Lite。由于这些端点经常以机器人检查回应脚本客户端，单靠其中任何一个都不可靠——该层的存在是为了让密钥提供方失败时仍能返回结果。

## 路由如何选择

垫片是独立进程，无法查询 Harness，因此它读取与 Harness 相同的两个文件：

- `~/.dsh/settings.yaml` —— `agent-default-model.provider` 选择路由，`llm-pi-ai.providers.<provider>` 提供 `baseURL`、`apiKeyEnv` 和模型名；
- `~/.dsh/.credentials.yaml` —— `refs.<apiKeyEnv>` 提供密钥。

路由按请求解析，因此在 Web UI 中更改提供方或模型即可切换搜索路由，无需重启垫片。把路由映射到凭据的是 `apiKeyEnv` 字段而非提供方名称，因此密钥命名特殊的路由依然能被解析。

设置 `DSH_SEARCH_SHIM_PROVIDER` 可为某次部署强制指定提供方，这也是在不修改设置的情况下检验回退层的方式。

两个层都会记录结果，包括跳过或未命中密钥提供方的原因，因此 `journalctl --user -u dsh-search-shim.service` 会显示实际作答的是哪条检索路径。

## 安装

部署由[安装器](../../DeepSeek-install.py)负责——本目录没有单独的脚本：

```sh
python3 DeepSeek-install.py install
```

它把两个模块复制到 `~/.dsh/search-shim`，写入一个 systemd 用户单元（其 `ExecStart` 指向解析出的 `node` 绝对路径），启用并重启它，并等待 `/health` 就绪。`doctor` 报告同样的状态，当垫片缺失或单元停止时，`doctor --fix` 会从检出的代码重新部署。

让 Harness 指向垫片：

```yaml
web-search-deepseek:
  baseURL: http://127.0.0.1:24881/v1
```

端口固定为 `24881`。若没有 systemd 用户管理器，安装器会部署文件并打印直接运行垫片的命令；无论哪种方式，`doctor` 都会把正在运行的垫片报告为健康。

## 文件

| 文件 | 作用 |
|---|---|
| `server.mjs` | HTTP 端点、Anthropic 格式信封以及无密钥引擎。 |
| `provider-route.mjs` | 从设置与凭据中解析当前提供方路由，并判定它支持哪种检索。 |

除 Node.js 18+（需要全局 `fetch`）外，垫片没有其他依赖。配置在请求时读取；`provider-route.mjs` 中的检索表是模块导入，因此修改它需要重启单元。
