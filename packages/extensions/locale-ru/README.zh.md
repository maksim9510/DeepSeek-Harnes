---
description: "面向 Web 客户端的俄语语言包：注册可选的 Русский 语言，并为每个已覆盖的命名空间提供一份 ru 词典，供组合、裁剪或扩展该语言包的用户与维护者使用。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-locale-ru

[English](README.md) | 中文

## 概述

`dsh-client-locale-ru` 以语言包的形式为 Web 客户端添加俄语：它的浏览器插件调用一次 `ctx.locale.addLanguage` 使 Русский 可被选择，再对每个已覆盖的命名空间调用一次 `ctx.locale.register` 提供俄语文案。核心 locale 服务（[`dsh-client-locale`](../../client/locale/README.zh.md)）从此把它当作任何内置语言对待——浏览器语言探测、`<html lang>` 跟踪、回退链与持久化偏好全部原样生效——因为该语言包不引入任何组件、槽位或自有状态。核心保持不动：`LOCALE_IDS` 仍只有两个内置条目，部署若移除本包也不会失去其他任何能力。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

官方 Web 花名册已把本包挂在 `dsh-client-locale` 旁边（[cordis.patch.yml](../../bundle/web-app/cordis.patch.yml)），无需其他操作。Settings → General → Language 随后在两个内置语言之后列出 Русский；主语言为俄语的浏览器会直接以它打开，`<html lang>` 跟随选择，所选语言通过 locale settings 命名空间持久化。移除花名册中的这一行，下次页面启动时语言及其词典一并消失。

### 覆盖语言包未涉及的命名空间

语言包之外的命名空间沿 `ru → en` 回退链解析，未覆盖的文案以英文呈现。要覆盖某个命名空间，请在自己的浏览器插件中用与本包相同的 `ctx.locale.register(ns, 'ru', dict)` 调用为该命名空间注册一份 `ru` 词典——语言定义已经存在，注册顺序无关紧要。命名空间是否声明了 key union 决定本包如何锁定键一致：当属主 UI 包声明了 key union 时，[`src/client/locales/`](src/client/locales) 中的词典使用 `satisfies Record<LocaleNamespaceMap['<ns>'], string>`；否则通过与属主 zh 词典的运行时键一致测试来保证。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现内部——点击展开</summary>

本包是一个浏览器插件加数据。插件入口为语言定义贡献一个 Cordis effect，为每个命名空间各贡献一个，因此 disposal 会把语言与全部词典一并移除，当前 locale 回退到 `en`。

| 文件 | 职责 |
|---|---|
| [`src/client/index.ts`](src/client/index.ts) | 插件入口：`addLanguage` effect 与每个命名空间一个 `register` effect |
| [`src/client/locales/index.ts`](src/client/locales/index.ts) | `ru` 语言定义与命名空间 → 词典映射 |
| [`src/client/locales/*.ts`](src/client/locales) | 每个命名空间一份俄语词典，在属主声明了键集之处与之绑定 |
| [`src/index.ts`](src/index.ts) | Node 半端：为空；花名册行是普通的双面插件，故需存在 |
| [`src/invariant.ts`](src/invariant.ts) | 每个包都必须具备的 no-op invariant 伴生插件 |

Node 半端为空，因为本包只有浏览器面（`dsh.client.platform: "web"`）；但花名册扫描仍需要一个具备双面的普通包。

</details>

-----

<a id="model-experience"></a>
## 模型体验

无：语言包是一个浏览器侧展示文案注册表，不注册任何模型可见的内容。

#### KV Cache 影响

无：本包既不组装也不发送 provider 请求。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

这些限制标出本包需要特别留意之处。它们是当前包约束，不是任务清单。

- **覆盖范围在包发布时冻结**——本包发布之后，已覆盖命名空间里新增的键会沿 `ru → en` 回退链以英文呈现，直到语言包更新；当本包自身滞后于某个已声明的 key union 时，`satisfies` 子句与一致性测试会让构建失败，因此缺口只在包这一侧于构建期可见。
- **未声明 key union 的命名空间只有运行时守护**——`permission.access`（无 `LocaleNamespaceMap` merge）在测试中与属主导出的 zh 词典做全键相等比对；`directory-browser`（词典内联注册）则针对真实插件注册逐键探测。属主与本包之间的版本漂移在此表现为测试失败，而非编译错误。
- **注册期捕获的文案在刷新前保持捕获时的语言**——以注册时捕获（而非每次渲染时读取）的文案（例如命令描述）在切换语言后，只有刷新页面才会改变语言。
- **未覆盖的命名空间呈现英文**——本包覆盖其发布时官方 Web 花名册所挂载的命名空间；之后新增的界面在词典落入本包之前一律从英文开始。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者的工作上下文——点击展开</summary>

翻译以各命名空间的 zh 字符串为源、en 为技术仲裁。占位符（`{name}`）、单位与品牌词必须逐字节保留；每个命名空间的 zh 源位于本次变更 Agent Note 所列的属主 UI 包中。

</details>
