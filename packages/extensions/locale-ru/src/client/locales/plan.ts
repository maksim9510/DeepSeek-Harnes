/** ru dictionary for the `plan` namespace: the composer plan chip's copy. */

import type {} from '@deepseek-ai/dsh-client-ui-plan/client'
import type { LocaleNamespaceMap } from '@deepseek-ai/dsh-client-ui-slots'

/** Russian dictionary, checked complete against the plan namespace key union. */
export const ru = {
  'chip.label': 'План',
  'preview.title': 'Plan',
  'preview.document': 'Plan · Markdown',
  'preview.action': 'Open',
  'preview.open': 'Open plan in sidebar',
  'preview.full': 'View full plan',
  'preview.openNamed': 'Open plan: {title}',
  'preview.loading': 'Loading plan…',
  'preview.failed': 'Could not load plan',
  'preview.invalidAddress': 'Invalid plan address',
  'preview.historyUnavailable': 'Session history is unavailable',
  'preview.notFound': 'This plan was not found',
  'preview.unavailable': 'Plan preview is unavailable',
  'preview.expired': 'This temporary plan preview has expired. Reopen it from the pending review card.',
  'chip.on.aria': 'Режим плана включён, нажмите, чтобы выключить',
  'chip.on.title': 'Режим плана включён — нажмите, чтобы выключить (/plan off)',
  'chip.exitFailed': 'Не удалось выйти из режима плана',
} satisfies Record<LocaleNamespaceMap['plan'], string>
