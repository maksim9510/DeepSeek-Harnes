/** ru dictionary for the `plan` namespace: the composer plan chip's copy. */

import type {} from '@deepseek-ai/dsh-client-ui-plan/client'
import type { LocaleNamespaceMap } from '@deepseek-ai/dsh-client-ui-slots'

/** Russian dictionary, checked complete against the plan namespace key union. */
export const ru = {
  'chip.label': 'План',
  'chip.on.aria': 'Режим плана включён, нажмите, чтобы выключить',
  'chip.on.title': 'Режим плана включён — нажмите, чтобы выключить (/plan off)',
  'chip.off.aria': 'Режим плана выключен, нажмите, чтобы включить',
  'chip.off.title': 'Режим плана выключен — нажмите, чтобы включить (/plan)',
  'chip.exitFailed': 'Не удалось выйти из режима плана',
  'preview.action': 'Open',
  'preview.document': 'Plan · Markdown',
  'preview.expired': 'This temporary plan preview has expired. Reopen it from the pending review card.',
  'preview.failed': 'Could not load plan',
  'preview.full': 'View full plan',
  'preview.historyUnavailable': 'Session history is unavailable',
  'preview.invalidAddress': 'Invalid plan address',
  'preview.loading': 'Loading plan…',
  'preview.notFound': 'This plan was not found',
  'preview.open': 'Open plan in sidebar',
  'preview.openNamed': 'Open plan: {title}',
  'preview.title': 'Plan',
  'preview.unavailable': 'Plan preview is unavailable',
} satisfies Record<LocaleNamespaceMap['plan'], string>
