---
description: "Russian language pack for the web client: registers the selectable Русский locale and one ru dictionary per covered namespace, for users and maintainers composing, trimming, or extending the pack."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-locale-ru

English | [中文](README.zh.md)

## Summary

`dsh-client-locale-ru` adds Russian to the web client as a language pack: its browser plugin calls `ctx.locale.addLanguage` once to make Русский selectable and `ctx.locale.register` once per covered namespace to supply Russian copy. The core locale service in [`dsh-client-locale`](../../client/locale/README.md) treats the result like any built-in language — browser detection, `<html lang>` tracking, the fallback chain, and the durable preference all work unchanged — because the pack introduces no components, no slots, and no state of its own. The core stays untouched: `LOCALE_IDS` keeps its two shipped entries, and a deployment that drops this package loses nothing else.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

The shipped web roster mounts the pack next to `dsh-client-locale` ([cordis.patch.yml](../../bundle/web-app/cordis.patch.yml)); nothing else is needed. Settings → General → Language then lists Русский after the two built-ins, a browser whose primary language is Russian opens on it, `<html lang>` follows the choice, and the selected language persists through the locale settings namespace. Removing the roster row removes the language and its dictionaries with the page's next boot.

### Covering a namespace the pack misses

A namespace outside the pack resolves through the `ru → en` fallback chain, so uncovered copy renders in English. To cover one, register a `ru` dictionary for that namespace from your own browser plugin through the same `ctx.locale.register(ns, 'ru', dict)` call the pack uses — the language definition is already present, and registration order does not matter. Whether a namespace has a declared key union decides how the pack pins parity: dictionaries in [`src/client/locales/`](src/client/locales) use `satisfies Record<LocaleNamespaceMap['<ns>'], string>` where the owning UI package declares one, and a runtime key-parity test against the owner's zh dictionary otherwise.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The package is one browser plugin plus data. The plugin entry contributes one Cordis effect for the language definition and one per namespace, so disposal removes the language and every dictionary together and the active locale falls back to `en`.

| File | Role |
|---|---|
| [`src/client/index.ts`](src/client/index.ts) | Plugin entry: the `addLanguage` effect and one `register` effect per namespace |
| [`src/client/locales/index.ts`](src/client/locales/index.ts) | The `ru` language definition and the namespace → dictionary map |
| [`src/client/locales/*.ts`](src/client/locales) | One Russian dictionary per namespace, pinned to its owner's key set where one is declared |
| [`src/index.ts`](src/index.ts) | Node half: empty, present because the roster row is an ordinary dual-face plugin |
| [`src/invariant.ts`](src/invariant.ts) | No-op invariant companion required of every package |

The node half ships empty because the pack is browser-only (`dsh.client.platform: "web"`); the roster scan still needs an ordinary package with both faces.

</details>

-----

<a id="model-experience"></a>
## Model Experience

None, as the language pack is a browser-side display-copy registry that registers nothing model-facing.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

These limits define where the pack needs special care. They are current package constraints, not a task backlog.

- **Coverage is frozen at pack release** — a key added to a covered namespace after this package's release resolves through the `ru → en` fallback and renders in English until the pack updates; the `satisfies` clause and the parity tests fail the build when the pack itself lags a declared key union, so the gap is visible at build time on the pack's side only.
- **Namespaces without a declared key union are guarded only at runtime** — `permission.access` (no `LocaleNamespaceMap` merge) pins full key equality against the owner's exported zh dictionary in a test, and `directory-browser` (dictionaries registered inline) is probed key by key against the real plugin registration; a drift between releases of the owner and this pack surfaces as a test failure here, not as a compile error.
- **Registration-time text keeps its capture language until reload** — copy captured at registration rather than rendered per keystroke (command descriptions, for example) changes language only after a page reload following a language switch.
- **Uncovered namespaces render English** — the pack covers the namespaces mounted by the shipped web roster at its release; any later surface addition starts in English until its dictionary lands here.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

Translations are authored against the zh strings with en as the technical arbiter. Placeholders (`{name}`), units, and brand terms must survive byte-exact; the zh source of each namespace lives in the owning UI package listed in the Agent Note for this change.

</details>
