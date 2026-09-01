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
} satisfies Record<LocaleNamespaceMap['plan'], string>
