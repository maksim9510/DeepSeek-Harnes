/** ru dictionary for the `skill` namespace: the dedicated skill tool row's copy. */

import type {} from '@deepseek-ai/dsh-client-ui-skill/client'
import type { LocaleNamespaceMap } from '@deepseek-ai/dsh-client-ui-slots'

/** Russian dictionary, checked complete against the skill namespace key union. */
export const ru = {
  'row.title': 'Навык',
  'row.running': 'Загрузка навыка',
  'row.failed': 'Не удалось загрузить навык',
  'row.stopped': 'Загрузка навыка прервана',
  'row.instructions': 'Инструкции',
  'row.inspect': 'Просмотреть',
  'menu.userOnly': 'только для пользователя',
} satisfies Record<LocaleNamespaceMap['skill'], string>
