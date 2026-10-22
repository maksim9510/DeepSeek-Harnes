# Agent Note: a search shim that discovers its retrieval instead of naming it

Status: implemented

English | [中文](2026-10-22-search-shim-discovery.zh.md)

## Problem

The deployed [web search shim](2026-09-21-deployed-web-search-shim.md) broke twice, and both failures came from a list rather than from the network.

First, the shim resolved its route from `~/.dsh/settings.yaml`. The Harness retired that document: the settings plugin renames it to `settings.yaml.imported` and writes the live values into the active profile's `cordis.patch.yml`. The shim kept reading the missing file, reported `no provider in agent-default-model` on every request, and fell through to the credential-free engines — so the gateway that answers reliably was never asked. Its parser also could not read a patch document, which is a sequence of loader entries, so pointing it at the new file alone would not have helped.

Second, the keyless tier was a fixed order of three engines parsed by one shared header set. Those endpoints block on TLS fingerprint and answer `202` with an empty page, or `429`; DuckDuckGo HTML and Lite both did during the incident, and Brave answered `429` throughout. A tier that is the whole fallback and breaks as one unit leaves no retrieval at all. Bing changed its result markup to wrap every link in `bing.com/ck/a?u=a1<base64url>` during the same period, which the parser rejected as a wrapper URL — a second, independent single point of failure in the same code path.

Third, an orphaned shim from an earlier manual run held port 24881. The unit died with `EADDRINUSE` on every restart, and because the unit declared no start limit, the supervisor retried 276 467 times. `doctor` reported the unit as healthy whenever the health endpoint answered, which the orphan did.

## Decision

Retrieval is discovered, not declared. Neither tier names a provider or a winner.

**The route** is read from the documents the Harness actually writes: the active profile's `cordis.patch.yml` (a loader-entry sequence), the retired `settings.yaml` as a fallback, and `.credentials.yaml`. The YAML reader covers the block, sequence, and flow subset those documents use, including the multi-line flow mapping the old document wrote. A route with an endpoint and a credential is offered its gateway's native search; nothing else decides. A gateway that answered with no citations is remembered for the process lifetime, because that is a capability fact, while a transient failure is retried.

**The engine tier** is a list of descriptors in `server.mjs`, each owning its own URL, headers, markup, and optional interstitial. `createEnginePool` orders them by recent success, quarantines an engine after two consecutive failures with an exponential cooldown capped at 15 minutes, and attempts every engine when all of them are cooling down. Bot checks (`202`, `403`, `429`, challenge body) are classified apart from hard errors so a throttled engine is retried instead of being written off. Adding an engine is one descriptor.

**Redirect unwrapping** is one function, not a per-parser filter: DuckDuckGo's `uddg`, Bing's base64 `u=a1`, Google's `/url?q=`, and Yahoo's `/RU=` all resolve to the page being cited. A wrapper the shim cannot read passes through, so a parser rejects it as a wrapper instead of returning it as a result.

**Port ownership is bounded.** The shim exits with status 3 on a fatal listen failure, and with 0 when the port already answers as itself; the unit carries `RestartPreventExitStatus=3`, `StartLimitBurst=5` over 60 seconds, and `KillMode=mixed`; `doctor` names a foreign port holder, and the deploy path stops it before restarting the unit. A listener that is already the unit's main process is never signalled.

## Alternatives considered

**Keep the provider allow-lists and add the missing providers.** Rejected: the failure was that a list had to be edited to match reality. A gateway that gains server-side search, or loses it, would need a code change and a redeploy.

**Read the route from the Harness API instead of its documents.** Rejected: the shim is a separate process under systemd and has no channel to the running Harness. Reading the same documents it reads is the only per-request source.

**Drive a real browser with TLS impersonation for the keyless tier**, which is what [duckduckgo-mcp-server](https://github.com/nickclyde/duckduckgo-mcp-server) does with `curl_cffi`. Rejected for now: it adds a Python or native dependency to a zero-dependency Node tool, and the same reliability is reachable by having several engines and memory of which one answered. The engine-descriptor seam is where such a backend would be added without touching the pipeline.

**Retry forever in the unit.** Rejected: the 276 467-restart loop is what hid the orphan. A bounded start limit makes a dead deployment visible instead of noisy.

**Protect the mechanisms, not the file names.** The sync already refused to lose the shim by marker, but a marker for the entrypoint name is satisfied by the broken version it replaced. The markers now name the engine pool, the gateway capability memory, the listen classification, the profile-patch route source, and the unit's start limit, so restoring an older shim fails the sync.

## Consequences

A route whose gateway does not implement search costs one wasted request per process, not one per search, and then the engines answer. The engine order adapts to what the network actually permits without a redeploy, so an engine that blocks this host stops being tried first. Both tiers log their outcome and `GET /engines` exposes the pool's failures, bot checks, successes, and cooldowns, so the journal names the retrieval that answered.

The engine list is still a list of markup knowledge: an engine that changes its page needs its descriptor updated. That is a smaller unit than the previous tier, and the other engines keep answering meanwhile. The shim depends on the gateway's OpenAI-compatible `web` plugin contract and on the engines' markup, neither of which is stable; the tier boundary is what makes either failure a logged miss instead of an error.

The tests under `tools/dsh-search-shim/tests/` cover the pipeline with an injected transport and clock, so an engine change is verified against recorded markup before the deployment sees it.
