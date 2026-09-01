/** ru dictionary for the `goal` namespace: the goal strip's copy. */

import type {} from '@deepseek-ai/dsh-client-ui-goal/client'
import type { LocaleNamespaceMap } from '@deepseek-ai/dsh-client-ui-slots'

/** Russian dictionary, checked complete against the goal namespace key union. */
export const ru = {
  'phase.active': 'Активная цель',
  'phase.paused': 'Приостановленная цель',
  'phase.blocked': 'Заблокированная цель',
  'objective.aria': 'Содержание цели',
  'commandInput.aria': 'Ввод команды',
  'action.save': 'Сохранить цель',
  'action.cancel': 'Отменить изменение',
  'action.pause': 'Приостановить цель',
  'action.resume': 'Возобновить цель',
  'action.edit': 'Изменить цель',
  'action.clear': 'Очистить цель',
} satisfies Record<LocaleNamespaceMap['goal'], string>
