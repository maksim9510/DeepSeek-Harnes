/** ru dictionary for the `deliverables` namespace: the produced-files row's copy. */

import type {} from '@deepseek-ai/dsh-client-ui-deliverables/client'
import type { LocaleNamespaceMap } from '@deepseek-ai/dsh-client-ui-slots'

/** Russian dictionary, checked complete against the deliverables namespace key union. */
export const ru = {
  'produced.label': 'Результаты',
  'produced.moreOne': '+ 1 файл',
  'produced.more': '+ {count} файлов',
  'produced.open': 'Открыть {name}',
  'produced.showInFolder': 'Показать в папке',
} satisfies Record<LocaleNamespaceMap['deliverables'], string>
