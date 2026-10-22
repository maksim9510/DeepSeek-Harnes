# DSH web search shim

English | [中文](README.zh.md)

[`web-search-deepseek`](../../packages/web/web-search-deepseek) is the Harness search provider: it POSTs one Anthropic Messages request to `baseURL + /messages` and reads the `web_search_tool_result` blocks it gets back. Pointing that provider's `baseURL` straight at a public gateway does not work, because a search must be executed server-side and the provider expects a result block that a plain chat completion never produces.

This directory holds the shim that fills that gap: a dependency-free Node HTTP server that answers in exactly the shape the provider expects and performs the real retrieval itself. It is a fork-local tool, not a published package, so it lives outside `packages/` and the upstream sync never merges into it.

## What it does

Retrieval is a two-tier pipeline. Neither tier names a provider: a gateway that serves search is discovered by asking it, and an engine that answers is discovered by parsing its page.

1. **The route's own gateway.** The shim asks the gateway the Agent is currently using for its native `web`-plugin search and reads the `url_citation` annotations. A route that answers with no citations is remembered for the process lifetime, because a gateway without the plugin keeps not having it; a transient failure is retried on the next request.
2. **The credential-free engines.** `DEFAULT_ENGINES` in `server.mjs` is the whole list: Bing, Marginalia, DuckDuckGo HTML, Brave, DuckDuckGo Lite. The pool runs them in order of recent success, quarantines an engine after its second consecutive failure with an exponential cooldown, and attempts every engine anyway when all of them are cooling down, so an outage can never leave the shim with nothing to try.

Two properties come from the engines rather than from a whitelist. An engine's own `request()` supplies its URL and headers, because a site that greets one header set with a consent page answers another normally. A class of failure is a bot check (`202`, `403`, `429`, or a challenge body) rather than a hard error, and each engine carries the knowledge to follow its own interstitial.

Adding an engine is one entry in `DEFAULT_ENGINES` with `id`, `request`, and `parse`. No other file changes.

## How the route is chosen

The shim is a separate process and cannot query the Harness, so it reads the same documents the Harness reads, on every request:

- the active profile's `~/.dsh/profiles/<name>/cordis.patch.yml`, where the Loader keeps `agent-default-model` and the `llm-pi-ai` provider dictionary, and where a settings write from the Web UI lands;
- `~/.dsh/settings.yaml`, the retired document the Harness renames to `settings.yaml.imported`, read as a fallback for a deployment that predates the profile patch;
- `~/.dsh/.credentials.yaml`, whose `refs.<apiKeyEnv>` supplies the key.

The route is resolved per request, so changing the provider or model in the Web UI switches the search route without restarting the shim. The `apiKeyEnv` field, not the provider name, maps a route to its credential. `DSH_HOME` moves the directory for a deployment outside the default home.

Setting `DSH_SEARCH_SHIM_PROVIDER` forces a provider and `DSH_SEARCH_SHIM_ENGINE` forces the gateway plugin's engine, which is how either tier is exercised without editing settings.

Both tiers log their outcome, including the reason a keyed provider was skipped or missed, so `journalctl --user -u dsh-search-shim.service` shows which retrieval actually answered. `GET /engines` reports the pool's health: failures, bot checks, successes, and any cooldown.

## Install

The [installer](../../DeepSeek-install.py) owns the deployment — there is no separate script for this directory:

```sh
python3 DeepSeek-install.py install
```

It copies the two modules into `~/.dsh/search-shim`, writes a systemd user unit whose `ExecStart` names the resolved absolute `node` binary, enables and restarts it, and waits for `/health`. It also writes `DEEPSEEK_SEARCH_BASE_URL=http://127.0.0.1:24881/v1` into the checkout `.env`, which is how the `web-search-deepseek` provider reaches the shim when its `baseURL` config is absent, so an installation searches without a separate settings step. `doctor` reports the deployment, the running unit, and the endpoint, and `doctor --fix` redeploys or rewires whichever is missing.

The port is fixed at `24881`. Without a systemd user manager the installer deploys the files, prints the command to run the shim directly, and `doctor` reports a running shim as healthy either way. A deployment that manages the endpoint elsewhere — the `web-search-deepseek` settings namespace, a `baseURL` in a profile patch, or its own `DEEPSEEK_SEARCH_BASE_URL` value — keeps it: the installer adds the line only when nothing points search at the shim.

### A port held outside the unit

A shim started by hand, or orphaned by a crashed supervisor, keeps the port; the unit then dies with `EADDRINUSE` on every restart and the supervisor retries forever. Three things bound that failure:

- the unit carries `StartLimitBurst=5` over 60 seconds, so a unit that cannot start stops instead of looping;
- the shim exits with status 3 on a fatal listen failure, which `RestartPreventExitStatus=3` does not retry; a second shim that finds the port already answering as itself exits 0;
- `doctor` names the foreign holder and `doctor --fix`, which redeploys through the installer, stops it before restarting the unit. A listener that is already the unit's main process is never signalled.

## Files

| File | Role |
|---|---|
| `server.mjs` | HTTP endpoint, Anthropic-format envelopes, the engine pool, and the engine descriptors. |
| `provider-route.mjs` | Reads the profile patch and credentials into the active route, and classifies which tier it can start on. |
| `tests/` | `node --test` coverage of the pipeline; every test injects its transport and clock. |

The shim has no dependencies beyond Node.js 18+ (for global `fetch`). Configuration is read at request time; the engine list is a module import, so changing `DEFAULT_ENGINES` needs a unit restart.

The upstream sync protects the mechanisms a working search depends on — the engine pool, the gateway capability memory, the listen-failure classification, the profile-patch route source, and the unit's start limit — by marker, so a merge that restored an older shim fails the sync instead of silently reinstating a failure.
