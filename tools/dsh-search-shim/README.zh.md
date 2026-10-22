# DSH 网络搜索垫片

[English](README.md) | 中文

[`web-search-deepseek`](../../packages/web/web-search-deepseek) 是 Harness 的搜索提供方：它向 `baseURL + /messages` 发送一个 Anthropic Messages 请求，并读取返回的 `web_search_tool_result` 区块。把该提供方的 `baseURL` 直接指向公共网关是行不通的，因为搜索必须在服务端执行，而该提供方期望的是一个普通对话补全永远不会产生的结果区块。

本目录存放填补这一空缺的垫片：一个无依赖的 Node HTTP 服务器，它按提供方期望的格式作答，并自行执行真正的检索。它是分支本地工具而非已发布软件包，因此位于 `packages/` 之外，上游同步永远不会合并到它。

## 它的作用

检索是一条两层流水线。两层都不点名任何提供方：能提供搜索的网关靠询问它来发现，能作答的引擎靠解析其页面来发现。

1. **路由自身的网关。** 垫片向 Agent 当前使用的网关请求其原生 `web` 插件搜索，并读取 `url_citation` 注解。以无引用作答的路由会在进程生命周期内被记住，因为没有该插件的网关始终不会有；瞬时失败则在下一个请求时重试。
2. **无需凭据的引擎。** `server.mjs` 中的 `DEFAULT_ENGINES` 就是完整清单：Bing、Marginalia、DuckDuckGo HTML、Brave、DuckDuckGo Lite。池按近期成功顺序运行它们，在连续第二次失败后以指数冷却隔离该引擎，并在全部冷却时仍然逐个尝试，因此一次故障绝不会让垫片无路可走。

有两项特性来自引擎本身而非白名单。引擎自身的 `request()` 提供其 URL 与请求头，因为对一组请求头回以同意页面的站点，对另一组会正常作答。一类失败是机器人检查（`202`、`403`、`429` 或质询页面）而非硬错误，且每个引擎各自携带跟随其自身过渡页的知识。

新增一个引擎就是在 `DEFAULT_ENGINES` 中加一条带有 `id`、`request` 和 `parse` 的条目。其他文件无需改动。

## 路由如何选择

垫片是独立进程，无法查询 Harness，因此它在每个请求上读取 Harness 同样读取的文档：

- 活动配置的 `~/.dsh/profiles/<name>/cordis.patch.yml`，Loader 在其中保存 `agent-default-model` 与 `llm-pi-ai` 提供方字典，Web UI 的设置写入也落在这里；
- `~/.dsh/settings.yaml`，即 Harness 重命名为 `settings.yaml.imported` 的旧文档，作为早于配置补丁的部署的回退读取；
- `~/.dsh/.credentials.yaml`，其 `refs.<apiKeyEnv>` 提供密钥。

路由按请求解析，因此在 Web UI 中切换提供方或模型会切换搜索路由，而无需重启垫片。映射路由到凭据的是 `apiKeyEnv` 字段而非提供方名称。`DSH_HOME` 可为默认主目录之外的部署移动该目录。

设置 `DSH_SEARCH_SHIM_PROVIDER` 可强制提供方，`DSH_SEARCH_SHIM_ENGINE` 可强制网关插件的引擎，这是在不修改设置的情况下演练任一层的方式。

两层都会记录其结果，包括密钥提供方被跳过或未命中的原因，因此 `journalctl --user -u dsh-search-shim.service` 会显示实际作答的检索。`GET /engines` 报告池的健康状况：失败、机器人检查、成功以及任何冷却。

## 安装

部署由[安装器](../../DeepSeek-install.py)负责——本目录没有单独的脚本：

```sh
python3 DeepSeek-install.py install
```

它把两个模块复制到 `~/.dsh/search-shim`，写入一个 systemd 用户单元（其 `ExecStart` 指向解析出的 `node` 绝对路径），启用并重启它，并等待 `/health` 就绪。它还会把 `DEEPSEEK_SEARCH_BASE_URL=http://127.0.0.1:24881/v1` 写入检出目录的 `.env`：当 `web-search-deepseek` 提供方没有 `baseURL` 配置时，正是通过该变量找到垫片，因此安装完成后无需额外的设置步骤即可搜索。`doctor` 报告部署、单元运行与端点三者状态，`doctor --fix` 会重新部署或补写缺失的那一项。

端口固定为 `24881`。若没有 systemd 用户管理器，安装器会部署文件并打印直接运行垫片的命令；无论哪种方式，`doctor` 都会把正在运行的垫片报告为健康。若部署方在别处管理端点——`web-search-deepseek` 设置命名空间、配置文件补丁中的 `baseURL`，或自行设置的 `DEEPSEEK_SEARCH_BASE_URL`——安装器会保留它，只在没有任何配置指向垫片时才追加该行。

### 单元之外的端口占用

手工启动的、或被崩溃的监督进程遗弃的垫片会占住端口；随后单元每次重启都以 `EADDRINUSE` 失败，而监督进程会永远重试。三件事限制该故障：

- 单元带有 60 秒内的 `StartLimitBurst=5`，因此无法启动的单元会停止而不是循环；
- 垫片在致命监听失败时以状态 3 退出，`RestartPreventExitStatus=3` 不会重试；发现端口已由自身作答的第二个垫片以 0 退出；
- `doctor` 指出外部占用者，`doctor --fix`（通过安装器重新部署）在重启单元前停止它。已是单元主进程的监听者绝不会被发送信号。

## 文件

| 文件 | 作用 |
|---|---|
| `server.mjs` | HTTP 端点、Anthropic 格式信封、引擎池与引擎描述符。 |
| `provider-route.mjs` | 把配置补丁与凭据读入活动路由，并判定它可从哪一层开始。 |
| `tests/` | 流水线的 `node --test` 覆盖；每个测试都注入自己的传输与时钟。 |

除 Node.js 18+（需要全局 `fetch`）外，垫片没有其他依赖。配置在请求时读取；引擎清单是模块导入，因此修改 `DEFAULT_ENGINES` 需要重启单元。

上游同步按标记保护搜索可用所依赖的机制——引擎池、网关能力记忆、监听失败分类、配置补丁路由来源，以及单元的启动限制——因此恢复旧版垫片的合并会令同步失败，而不是悄悄重建故障。
