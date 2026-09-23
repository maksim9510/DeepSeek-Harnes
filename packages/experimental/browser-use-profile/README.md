---
description: "Add model-facing browser automation to a Web profile so an agent can open, click through, and read console errors from the running GUI."
kind: "package-bundle"
---

# @deepseek-ai/dsh-experimental-browser-use-profile

English | [中文](README.zh.md)

## Summary

`dsh-experimental-browser-use-profile` is the published experimental bundle that gives a Session real browser automation tools and points them at the Web GUI the user is looking at. Selecting it mounts [`@deepseek-ai/dsh-browser-use`](../../browser-use/browser-use/README.md) with one Playwright MCP provider, and publishes the token-bearing GUI URL as a managed shell variable so a fresh browser profile can authenticate. The dsh installation ships it as an optional bundle; the fork's installer switches it on for the `web` profile, so the tools work after install with no separate setup step.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

### Install into a profile

Add the bundle to an initialized `web` profile:

```sh
dsh plugin --profile web add @deepseek-ai/dsh-experimental-browser-use-profile
```

Removing it with `dsh plugin --profile web remove @deepseek-ai/dsh-experimental-browser-use-profile` removes the browser tools and the GUI URL variable together.

### What you get

Every Session gains the Playwright MCP browser tools. Because the bundle also publishes `DSH_WEB_AUTH_URL`, a Session can drive the running GUI — open the right-side browser panel, add a tab, click, and read console errors — instead of only reasoning about the page it cannot see. Selecting the bundle also switches the right Sidebar's built-in Browser on: `dsh-web-app` mounts that row disabled for every profile except `desktop`, and driving a page the user cannot see is a worse answer, so this bundle's later layer enables it. The browser binary is Chromium; the fork's installer provisions the revision the pinned provider expects.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The package has two runtime parts. [`cordis.patch.yml`](cordis.patch.yml) is an ordered patch over `dsh-web-app`: it inserts `@deepseek-ai/dsh-browser-use`, then the single provider row `@deepseek-ai/dsh-experimental-browser-use-playwright-mcp`, then this package's own glue row, and finally re-enables the Sidebar Browser row `dsh-web-app` leaves opt-in (see [What you get](#what-you-get)). The provider slot is exclusive — `ctx.browserUse.register` throws on a second registration — which is why the patch carries exactly one provider and `tests/profile.spec.ts` asserts that.

[`src/index.ts`](src/index.ts) is the glue. It registers one `ctx.shellEnv` contributor declaring `DSH_WEB_AUTH_URL`, whose resolver composes `connection.authenticatedUrl(http://127.0.0.1:<port>)` per tool execution, and one `systemPrompt` section stating that opening that variable is how a browser reaches the GUI. Both contributions `inject` rather than require their services, so a profile without `dsh-web-app` boots with no variable and no section; the resolver withholds the variable unless both the Web server and the connection service are present, so it never publishes the unauthenticated origin under a name that promises a launch token. The launch token lives in process memory only, so the value is resolved fresh and never persisted.

| File | Role |
|---|---|
| [`cordis.patch.yml`](cordis.patch.yml) | Ordered Web patch: capability service, one provider, this glue, and the Sidebar Browser opt-in |
| [`src/index.ts`](src/index.ts) | `DSH_WEB_AUTH_URL` contributor and the browser-surface prompt section |
| [`tests/profile.spec.ts`](tests/profile.spec.ts) | Asserts the manifest, the row order, provider exclusivity, and the composed Sidebar Browser override |
| — | No runtime invariant companion is published; the exclusive registration owned by `dsh-browser-use` already fails loudly on a second provider. |

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [Experimental packages](../README.md) — incubation status and publication policy.
- [Browser use](../../browser-use/browser-use/README.md) — the exclusive provider registry this bundle mounts.
- [Playwright MCP provider](../browser-use-playwright-mcp/README.md) — the pinned provider, its launch/attach modes, and its prompt caveat.
- [Web bundle](../../bundle/web-app/README.md) — the stable browser layer this patch extends.

-----

<a id="model-experience"></a>
## Model Experience

Directly. This is the bundle that gives a Session browser tools, so it adds their schemas and results to the request, and it adds one prompt section plus one managed shell variable.

#### KV Cache effect

The prompt section is static text placed at the `WEB_SURFACE` order, so it is stable prefix content across every Step in the Session. Tool schemas come from the provider and are likewise stable. The variable's value changes only when the process restarts.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **The GUI's right panel is driven from outside it.** A browser tool drives the assembled page, not the panel iframe's interior: reaching into the iframe's content needs a target-specific CDP channel that [`ui-sidebar-browser`](../../client/ui-sidebar-browser/README.md) does not implement. Testing what the panel renders is done through the page that hosts it.
- **Launch mode is isolated.** The provider passes `--isolated`, so the MCP browser keeps an in-memory profile and any cookie it mints dies with the provider; each Session authenticates again from `DSH_WEB_AUTH_URL`.
- **Chromium is provisioned by the installer, not by this package.** A missing binary degrades individual tool calls with a clean error and never fails MCP startup or Session creation.
- **`format` needs care in prompt compositions.** Keep browser tool names under `<unlisted-tools>` in a `toolOrder`; naming them explicitly can break prompt assembly for Sessions with no browser connection.
- **Headless by default.** The patched provider runs headless; a composition that needs a visible window can override `headless` for the `browser-provider` row.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

The bundle is the fork's seam: it keeps browser enablement in one experimental package plus one installer step, so `packages/bundle/web-app/cordis.patch.yml` stays identical to upstream and syncs cleanly.

</details>
