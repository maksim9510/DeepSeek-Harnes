# Agent Note: 同步 locale 适配循环必须校验最后一次适配

Status: implemented

[English](2026-09-07-sync-locale-adaptation-loop.md) | 中文

## 问题

`DeepSeek-sync.py` 通过迭代修复 locale-key 漂移（上游在某命名空间中新增或删除键）：运行 `typecheck` → 解析错误 → 适配 `ru` 词典 → 重复。循环恰好运行 3 次，每次由一次 typecheck 和一次适配组成。

这有一个微妙的漏洞：**最后一次**适配从未被校验。TypeScript 会报告多余属性错误（TS2353），这些错误会遮蔽缺失属性错误（TS1360）；修复多余键会暴露出新的缺键错误，而这些缺键错误本身又可能遮蔽更多的多余键。因此，级联可能需要比循环所允许的更多的适配/校验周期。当第 3 次适配解决了剩余错误时，脚本不再重新运行 `typecheck`，但仍然报告失败。

2026-09-07 同步中的一个具体案例：`conversation` 命名空间将拖拽键 `image.*` 重命名为 `attachment.*`、将 `command.imagesUnsupported` 重命名为 `command.attachmentsUnsupported`，并新增了一组 `file.*` 键。解决所有错误需要 4 次 typecheck/适配周期。

## 决策

重构循环，使每次适配（包括最后一次）之后都运行一次全新的 typecheck。循环现在：

1. 在每次迭代开始时运行 typecheck。

2. 若 typecheck 通过 → 返回成功。

3. 若 typecheck 因非 locale 错误失败 → 返回人工问题。

4. 若所有最大尝试次数都用尽 → 返回失败。

5. 否则 → 适配、暂存并继续循环。

最大尝试次数从 3 次提高到 5 次，为级联的 locale 漂移留足余量。每次适配之后都会在下一次迭代中运行一次校验性的 typecheck，因此每次适配的结果都会被检查。

## 曾考虑的替代方案

- **保留固定 3 次迭代循环并增加一次收尾 typecheck**：否决。当级联需要超过 3 轮修复时，收尾检查仍然会失败，正如 `conversation` 命名空间案例需要 4 个周期。

- **提高尝试次数但不逐次校验**：否决。只校验最后一次 typecheck 仍会漏掉那种其解决本身又暴露出新错误的适配——校验必须跟在每次适配之后，而不仅仅是最后一次。

## 后果

- 同步脚本不再因为级联超过 3 个周期的可解决的 locale 键漂移而中止。
- 脚本中的 `RU_TRANSLATIONS` 现在包含上游重命名/新增的键（attachment.*、file.*、command.attachmentsUnsupported、layout.fileAttachments），使未来的自动适配生成俄语文本而不是英文后备。
- 循环保持有界：超过 5 次尝试仍不收敛的适配仍会报错等待人工决定，而不是无限循环。