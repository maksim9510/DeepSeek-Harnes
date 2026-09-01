# Agent Note: Russian language pack for the web client

Status: implemented

English | [中文](2026-08-31-client-locale-ru-language-pack.zh.md)

## Problem

The web client ships exactly two locales, 中文 and English, and a fork of this repository needs a Russian interface for `pnpm dsh web`. Two scopes were fixed up front: the localization covers the client UI only (the documentation tree stays en/zh — roughly 1100 paired documents and the pairing scripts around them are a separate project), and the fork wants the smallest possible diff against upstream, so changes to core client packages are costly even when technically clean. The core `dsh-client-locale` service already exposes a public external-language API (`addLanguage` plus the untyped `register(ns, locale, dict)`, recipe in its README), but nothing in the repository exercised it, and `LOCALE_IDS` fixes `['zh', 'en']` as the shipped set.

## Decision

Russian ships as a language-pack plugin, [`@deepseek-ai/dsh-client-locale-ru`](../../../../packages/extensions/locale-ru/README.md), under `packages/extensions/` as an ordinary release member (precedent: `ui-cordis`). Its browser plugin contributes one effect registering the `ru` language definition (label Русский, fallback `en`) and one effect per covered namespace registering a Russian dictionary, so disposal removes the language and all dictionaries together. The web roster gains a `locale-ru` row after `locale` in `packages/bundle/web-app/cordis.patch.yml`; the corresponding workspace dependency satisfies `verify-cordis-config`.

The core `dsh-client-locale` is unchanged: `LOCALE_IDS` keeps two entries, browser detection (`ru-RU → ru` by primary subtag), `<html lang>` passthrough, the `ru → en` fallback chain, and the durable locale preference all work through the existing mechanisms. Key parity is enforced without core changes: namespaces with a declared `LocaleNamespaceMap` key union use `satisfies Record<LocaleNamespaceMap['<ns>'], string>` in the pack (compile-time missing-and-excess detection through the type-only merge import), and the two namespaces the compiler cannot see — `permission.access`, which has no key union, and `directory-browser`, which registers its dictionaries inline — are guarded at runtime by tests that compare against the owner's zh key set or probe the real plugin registration key by key.

Tests in the pack boot the real settings + locale stack over a stub Host settings document and pin: the catalog order (Русский after the two built-ins), `ru-RU` browser detection selecting `ru`, `<html lang="ru">`, Russian copy from the packed dictionary, and disposal reverting the catalog and the active locale. The core's "exactly two shipped locales" test constructs its own `LocaleRuntime` and stays green, because the pack never mutates module-level state the core tests read.

## Alternatives considered

**A third built-in locale in `dsh-client-locale`.** Extending `LOCALE_IDS` to `['zh', 'en', 'ru']` and shipping the dictionaries inside the core package would give every deployment a language it may never use and put the fork's diff inside the most upstream-visible client package; it also forces the core's two-locale invariant and its tests to be rewritten. Rejected: the public external-language API exists precisely for this, and a pack keeps the core untouched.

**Forking the client packages instead of adding a pack.** Keeping ru dictionaries in a private patch of each UI package would translate at the source but multiply the diff across ~28 packages and make every upstream sync a merge chore. Rejected: one data-only package is reviewable and disposable per namespace.

**Translating the documentation tree as well.** Deferred as a separate project: the en/zh docs pairing is enforced by blob-hash sidecars and ~15 hardcoded en↔zh scripts, so a third language there is a tooling change, not a translation batch.

## Consequences

Coverage is frozen at the pack's release: keys added to covered namespaces later render English through the fallback until the pack updates, and namespaces mounted by the roster after release start uncovered. Registration-time text (command descriptions, for example) keeps its capture language until a page reload. The web roster now scans one more browser package, and every new UI namespace requires either a dictionary here or an explicit acceptance of English fallback. Nothing model-visible changed: no prompt input, no session event, no snapshot re-record.
