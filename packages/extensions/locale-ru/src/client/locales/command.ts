/** ru dictionary for the `command` namespace: the popupSelect shell's copy. */

import type {} from '@deepseek-ai/dsh-client-ui-commands/client'
import type { LocaleNamespaceMap } from '@deepseek-ai/dsh-client-ui-slots'

/** Russian dictionary, checked complete against the command namespace key union. */
export const ru = {
  'search.placeholder': 'Поиск…',
  'search.aria': 'Фильтр вариантов',
  'status.loading': 'Загрузка вариантов…',
  'status.applying': 'Применение…',
  'status.empty': 'Нет вариантов',
  'overlay.aria': 'Варианты /{command}',
  'listbox.aria': 'Совпадения для /{command}',
  'notice.imagesUnsupported': '/{command} не принимает изображения; сначала удалите их',
} satisfies Record<LocaleNamespaceMap['command'], string>
