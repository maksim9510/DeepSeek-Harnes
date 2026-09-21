# DSH web search shim

English | [中文](README.zh.md)

[`web-search-deepseek`](../../packages/web/web-search-deepseek) is the Harness search provider: it POSTs one Anthropic Messages request to `baseURL + /messages` and reads the `web_search_tool_result` blocks it gets back. Pointing that provider's `baseURL` straight at a public gateway does not work, because a search must be executed server-side and the provider expects a result block that a plain chat completion never produces.

This directory holds the shim that fills that gap: a dependency-free Node HTTP server that answers in exactly the shape the provider expects and performs the real retrieval itself. It is a fork-local tool, not a published package, so it lives outside `packages/` and the upstream sync never merges into it.

## What it does

For every request the shim resolves the provider the Agent is currently using, asks that provider for search when it can, and otherwise falls back to credential-free engines.

| Provider | Retrieval |
|---|---|
| `routerai` | The gateway's native `web` plugin with the `exa` engine; hits are read from `url_citation` annotations. |
| `promee`, `deepseek` | No server-side search exists, so the shim goes straight to the keyless engines instead of issuing a request that cannot succeed. |
| Any other | The gated default plugin engine is attempted; a miss falls through to the keyless engines. |

The keyless tier runs DuckDuckGo HTML, then Bing, then DuckDuckGo Lite. Because those endpoints answer a scripted client with a bot check often enough, no single one of them is reliable on its own — the tier exists so that a failing keyed provider still returns results.

## How the route is chosen

The shim is a separate process and cannot query the Harness, so it reads the same two files the Harness reads:

- `~/.dsh/settings.yaml` — `agent-default-model.provider` selects the route, and `llm-pi-ai.providers.<provider>` supplies `baseURL`, `apiKeyEnv`, and the model name;
- `~/.dsh/.credentials.yaml` — `refs.<apiKeyEnv>` supplies the key.

The route is resolved per request, so changing the provider or model in the Web UI switches the search route without restarting the shim. The `apiKeyEnv` field, not the provider name, is what maps a route to its credential, which is why a route whose key is named unusually still resolves.

Setting `DSH_SEARCH_SHIM_PROVIDER` forces a provider for one deployment, which is how the fallback tier is exercised without editing settings.

Both tiers log their outcome, including the reason a keyed provider was skipped or missed, so `journalctl --user -u dsh-search-shim.service` shows which retrieval actually answered.

## Install

The [installer](../../DeepSeek-install.py) owns the deployment — there is no separate script for this directory:

```sh
python3 DeepSeek-install.py install
```

It copies the two modules into `~/.dsh/search-shim`, writes a systemd user unit whose `ExecStart` names the resolved absolute `node` binary, enables and restarts it, and waits for `/health`. `doctor` reports the same state and `doctor --fix` redeploys the shim from the checkout when it is missing or the unit stopped.

Point the Harness at the shim:

```yaml
web-search-deepseek:
  baseURL: http://127.0.0.1:24881/v1
```

The port is fixed at `24881`. Without a systemd user manager the installer deploys the files, prints the command to run the shim directly, and `doctor` reports a running shim as healthy either way.

## Files

| File | Role |
|---|---|
| `server.mjs` | HTTP endpoint, Anthropic-format envelopes, and the keyless engines. |
| `provider-route.mjs` | Resolves the active provider route from settings and credentials, and classifies which retrieval it supports. |

The shim has no dependencies beyond Node.js 18+ (for global `fetch`). Configuration is read at request time; the retrieval table in `provider-route.mjs` is a module import, so changing it needs a unit restart.
