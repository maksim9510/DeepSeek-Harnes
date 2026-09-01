/** ru dictionary for the `approval` namespace: the approval prompt's copy. */

import type {} from '@deepseek-ai/dsh-client-ui-approval/client'
import type { LocaleNamespaceMap } from '@deepseek-ai/dsh-client-ui-slots'

/** Russian dictionary, checked complete against the approval namespace key union. */
export const ru = {
  'waiting': 'Ожидание подтверждения',
  'detail.aria': 'Подробности подтверждения',
  'escalation': 'Инструмент {toolName} запрашивает привилегированное выполнение',
  'reject': 'Отклонить',
  'allowOnce': 'Разрешить один раз',
} satisfies Record<LocaleNamespaceMap['approval'], string>
