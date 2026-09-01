# Agent Note: 面向 Web 客户端的俄语语言包

Status: implemented

[English](2026-08-31-client-locale-ru-language-pack.md) | 中文

## Problem

Web 客户端只内置两个 locale——中文与英文——而本仓库的一个 fork 需要 `pnpm dsh web` 的俄语界面。范围预先固定两点：本地化只覆盖客户端 UI（文档树保持 en/zh——约 1100 份成对文档及其配对脚本属于另一个项目），且该 fork 希望与上游保持最小 diff，因此即便技术上干净，触碰核心 client 包的代价也很高。核心 `dsh-client-locale` 服务已经暴露了公开的外部语言 API（`addLanguage` 加非类型化的 `register(ns, locale, dict)`，配方见其 README），但仓库中尚无任何代码用到它，且 `LOCALE_IDS` 把 `['zh', 'en']` 固定为出厂集合。

## Decision

俄语以语言包插件的形式出厂：[`@deepseek-ai/dsh-client-locale-ru`](../../../../packages/extensions/locale-ru/README.zh.md)，位于 `packages/extensions/`，作为普通 release 成员（先例：`ui-cordis`）。它的浏览器插件贡献一个 effect 注册 `ru` 语言定义（label 为 Русский，fallback 为 `en`），并为每个已覆盖的命名空间各贡献一个 effect 注册俄语词典，因此 disposal 会把语言与全部词典一并移除。Web 花名册在 `packages/bundle/web-app/cordis.patch.yml` 中于 `locale` 行之后新增 `locale-ru` 行；对应的 workspace 依赖满足 `verify-cordis-config`。

核心 `dsh-client-locale` 保持不变：`LOCALE_IDS` 仍为两个条目，浏览器探测（按 primary subtag 把 `ru-RU` 解析为 `ru`）、`<html lang>` 透传、`ru → en` 回退链与持久化 locale 偏好全部经既有机制工作。键一致性的保证不需要改核心：声明了 `LocaleNamespaceMap` key union 的命名空间在语言包内使用 `satisfies Record<LocaleNamespaceMap['<ns>'], string>`（经类型-only merge import 在编译期同时检出缺失与多余键）；编译器看不到的两个命名空间——没有 key union 的 `permission.access`，以及内联注册词典的 `directory-browser`——由运行时测试守护：或与属主的 zh 键集做全量比对，或对真实插件注册逐键探测。

语言包内的测试以 stub Host settings 文档启动真实的 settings + locale 栈，固定以下行为：目录顺序（Русский 排在两个内置语言之后）、`ru-RU` 浏览器探测选中 `ru`、`<html lang="ru">`、来自随包词典的俄语文案，以及 disposal 后目录与 active locale 的回退。核心的「恰好两个出厂 locale」测试构造自己的 `LocaleRuntime`，依旧绿：语言包从不改写核心测试读取的模块级状态。

## Alternatives considered

**在 `dsh-client-locale` 中加第三个内置 locale。** 把 `LOCALE_IDS` 扩为 `['zh', 'en', 'ru']` 并把词典放进核心包，会让每个部署都带上一种可能永远用不到的语言，并把 fork 的 diff 放进上游可见度最高的 client 包；还被迫重写核心的双 locale 不变量及其测试。否决：公开的外部语言 API 正是为此而设，语言包能让核心不动。

**改用 fork client 包而非新增语言包。** 把 ru 词典放进各 UI 包的私有补丁可以在源头翻译，但 diff 会散布到约 28 个包，且每次上游同步都变成合并苦役。否决：一个纯数据包既可整体评审，也可按命名空间处置。

**同时翻译文档树。** 作为独立项目推迟：en/zh 文档配对由 blob-hash sidecar 与约 15 个硬编码 en↔zh 的脚本强制，第三种语言意味着工具链变更，而非一批翻译。

## Consequences

覆盖范围在语言包发布时冻结：此后已覆盖命名空间中新增的键经回退链以英文呈现，直到语言包更新；花名册此后新增挂载的命名空间一开始就未被覆盖。注册期捕获的文案（例如命令描述）在页面刷新前保持捕获时的语言。Web 花名册现在多扫描一个浏览器包，此后每个新的 UI 命名空间要么在此补词典，要么显式接受英文回退。模型可见面无任何变化：没有 prompt 输入、没有 session 事件、没有快照重录。
