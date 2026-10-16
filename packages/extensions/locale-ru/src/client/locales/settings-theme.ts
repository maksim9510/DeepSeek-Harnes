/** ru dictionary for the `settings.theme` namespace: the Appearance and font-size rows' copy. */

import type {} from '@deepseek-ai/dsh-client-ui-theme/client'
import type { LocaleNamespaceMap } from '@deepseek-ai/dsh-client-ui-slots'

/** Russian dictionary, checked complete against the settings.theme namespace key union. */
export const ru = {
  'appearance.title': 'Внешний вид',
  'appearance.light': 'Светлая',
  'appearance.dark': 'Тёмная',
  'appearance.system': 'Системная',
  'fontSize.unit': 'px',
  'fontFamily.code.description': 'Используется для блоков кода, встроенного кода и вывода инструментов. Разделяйте шрифты запятыми; оставьте пустым для значения по умолчанию',
  'fontFamily.code.title': 'Шрифт кода',
  'fontFamily.placeholder': 'По умолчанию',
  'fontFamily.terminal.description': 'Используется для бокового терминала. Разделяйте шрифты запятыми; оставьте пустым для значения по умолчанию',
  'fontFamily.terminal.title': 'Шрифт терминала',
  'fontFamily.text.description': 'Используется для интерфейса и текста диалога. Разделяйте шрифты запятыми; оставьте пустым для значения по умолчанию',
  'fontFamily.text.title': 'Шрифт текста',
  'fontSize.code.decrease': 'Уменьшить размер шрифта кода',
  'fontSize.code.description': 'Используется для блоков кода, встроенного кода и вывода инструментов',
  'fontSize.code.increase': 'Увеличить размер шрифта кода',
  'fontSize.code.title': 'Размер шрифта кода',
  'fontSize.more': 'Дополнительные настройки шрифта',
  'fontSize.terminal.decrease': 'Уменьшить размер шрифта терминала',
  'fontSize.terminal.description': 'Используется для бокового терминала',
  'fontSize.terminal.increase': 'Увеличить размер шрифта терминала',
  'fontSize.terminal.title': 'Размер шрифта терминала',
  'fontSize.text.decrease': 'Уменьшить размер шрифта',
  'fontSize.text.description': 'Влияет только на содержимое диалога',
  'fontSize.text.increase': 'Увеличить размер шрифта',
  'fontSize.text.title': 'Размер шрифта',
} satisfies Record<LocaleNamespaceMap['settings.theme'], string>
