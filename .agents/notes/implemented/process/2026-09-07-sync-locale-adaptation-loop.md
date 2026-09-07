---
name: sync-locale-adaptation-loop
scope:
  - packages/support
  - DeepSeek-sync.py
---

# Sync locale-adaptation loop must verify the final adaptation

## Problem

`DeepSeek-sync.py` repaired locale-key drift (upstream adding or removing
keys in a namespace) by iterating: run `typecheck` → parse errors → adapt
the `ru` dictionaries → repeat. The loop ran exactly 3 iterations, each
consisting of a typecheck followed by an adaptation.

This had a subtle gap: the **last** adaptation was never verified. TypeScript
reports excess-property errors (TS2353) that hide missing-property errors
(TS1360); fixing the excess keys surfaces new missing-key errors, which
themselves may hide further excess keys. A cascade can therefore require
more adaptation/verify cycles than the loop allowed. When the 3rd adaptation
resolved the remaining errors, the script never re-ran `typecheck` and
reported failure anyway.

A concrete case from the 2026-09-07 sync: the `conversation` namespace
renamed `image.*` drag-and-drop keys to `attachment.*`, renamed
`command.imagesUnsupported` to `command.attachmentsUnsupported`, and added
a `file.*` key set. Resolving all errors required 4 typecheck/adapt cycles.

## Decision

Restructure the loop so a fresh typecheck runs **after** every adaptation,
including the last one. The loop now:

1. Runs typecheck at the top of each iteration.
2. If typecheck passes → return success.
3. If typecheck fails with non-locale errors → return a human problem.
4. If all max attempts are exhausted → return failure.
5. Otherwise → adapt, stage, and loop.

The max attempts were raised from 3 to 5 to give cascading locale drift
enough headroom. Each adaptation is followed by a verifying typecheck in
the next iteration, so the final adaptation's result is always checked.

## Consequences

- The sync script no longer aborts on resolvable locale-key drift that
  cascades beyond 3 cycles.
- `RU_TRANSLATIONS` in the script now includes entries for the keys that
  upstream renamed/added (attachment.*, file.*, command.attachmentsUnsupported,
  layout.fileAttachments) so future auto-adaptations produce Russian text
  instead of the English fallback.
