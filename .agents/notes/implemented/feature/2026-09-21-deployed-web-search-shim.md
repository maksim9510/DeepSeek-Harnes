# Agent Note: a deployed web search shim outside the package tree

Status: implemented

English | [中文](2026-09-21-deployed-web-search-shim.zh.md)

## Problem

The `web-search-deepseek` provider POSTs one Anthropic Messages request to `baseURL + /messages` and reads `web_search_tool_result` blocks from the answer. The fork's configured provider is a third-party OpenAI-compatible gateway whose search runs as a request plugin and returns `url_citation` annotations; pointing the provider's `baseURL` at that gateway produces no result block, so web search fails. A provider that exposes no server-side search at all fails the same way, and the keyless HTML engines a local endpoint could fall back to answer a scripted client with a bot check often enough that one of them alone is not dependable.

## Decision

The fork ships the shim as fork-local source in `tools/dsh-search-shim`, deployed outside the package tree, and the [installer](../../../../DeepSeek-install.py) owns its deployment.

`server.mjs` answers the provider in the expected format and owns the credential-free engines (DuckDuckGo HTML, then Bing, then DuckDuckGo Lite). `provider-route.mjs` resolves, per request, the provider the Agent is currently using: it reads `agent-default-model.provider` from `settings.yaml`, takes `baseURL`, `apiKeyEnv`, and the model from `llm-pi-ai.providers.<provider>`, and reads the key from `refs.<apiKeyEnv>` in `.credentials.yaml`. The route's `apiKeyEnv` field, not its provider name, maps a route to its credential.

Retrieval follows the resolved route. A gateway whose search plugin is known to work is asked first, with the `exa` engine, and its `url_citation` annotations become result blocks. A provider known to expose no server-side search skips that request and goes straight to the keyless engines. Any other provider attempts the gated default engine. Every route falls back to the keyless engines, and both tiers log their outcome with the reason a keyed provider was skipped or missed, so the journal shows which retrieval answered. `DSH_SEARCH_SHIM_PROVIDER` forces a provider for one deployment, which is how the fallback tier is exercised without editing settings.

The installer copies the two modules into `~/.dsh/search-shim`, writes a systemd user unit whose `ExecStart` names the resolved absolute `node` path, enables and restarts the unit, and waits for the health endpoint before reporting success. `doctor` reports the same state, and `doctor --fix` redeploys from the checkout. A machine without a systemd user manager gets the files and the command to run the shim directly. A checkout without `tools/dsh-search-shim` is not a defect: the check is skipped and the install continues, because the Web UI works without web search.

The sync protects the shim through `PROTECTED_MARKERS` entries for both modules and for the installer constant that names them, so a merge that removes them stops the sync instead of silently dropping the fork's search.

## Alternatives considered

**Restore the removed `packages/web/web-search-routerai` provider.** Rejected: a package under `packages/` is upstream's tree, so the next sync would either lose it or require a conflict decision every time, and the fork retired that package deliberately. The deployed shim needs no package slot and the sync protects it by marker.

**Point `web-search-deepseek.baseURL` directly at the gateway.** Rejected: the gateway's Messages route does not execute server-side search — it answers with a `tool_use` block the provider cannot read — so the provider would raise `WEB_PROVIDER_ERROR` instead of returning results.

**Deploy from a script inside `tools/dsh-search-shim`.** Rejected: `DeepSeek-install.py` is the fork's installation entry point and a protected marker, and a second script would duplicate the deployment path and drift from it.

**Ship the shim as a published package.** Rejected: it is a deployment-local endpoint with no library consumers, and packaging it would add a workspace member whose only role is to be copied to a fixed path.

## Consequences

Web search works after `python3 DeepSeek-install.py install` with no separate setup step, and the shim follows the provider the Agent is switched to without a restart, because the route is resolved per request. The retrieval table in `provider-route.mjs` is a module import, so changing it needs a unit restart; configuration is read at request time and does not.

The shim depends on the gateway's OpenAI-compatible plugin contract and on the keyless engines' markup, neither of which is stable. A gateway-side change surfaces as a logged miss and a fallback rather than an error, and the keyless tier is the reason a failing keyed provider still answers. Provider-route parsing covers the block and flow-mapping subset the deployment writes; an exotic shape in `settings.yaml` resolves as a missing route and logs the reason instead of failing the search.

The deployment lives in the Harness home, not the checkout, so it survives a sync and a checkout rewind but not a reinstall; the installer recreates it, and `doctor --fix` repairs a deployment that was removed.
