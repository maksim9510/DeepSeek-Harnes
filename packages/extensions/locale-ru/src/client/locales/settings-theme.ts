/** ru dictionary for the `settings.theme` namespace: the Appearance and font-size rows' copy. */

import type {} from '@deepseek-ai/dsh-client-ui-theme/client'
import type { LocaleNamespaceMap } from '@deepseek-ai/dsh-client-ui-slots'

/** Russian dictionary, checked complete against the settings.theme namespace key union. */
export const ru = {
  'appearance.title': 'Внешний вид',
  'appearance.light': 'Светлая',
  'appearance.dark': 'Тёмная',
  'appearance.system': 'Системная',
  'fontSize.title': 'Размер шрифта',
  'fontSize.description': 'Влияет только на содержимое сессии',
  'fontSize.unit': 'px',
  'fontSize.increase': 'Увеличить размер шрифта',
  'fontSize.decrease': 'Уменьшить размер шрифта',
} satisfies Record<LocaleNamespaceMap['settings.theme'], string>
