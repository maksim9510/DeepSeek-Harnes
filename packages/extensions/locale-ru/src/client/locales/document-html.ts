/** ru dictionary for the `documentHtml` namespace: the HTML document preview renderer. */

import type {} from '@deepseek-ai/dsh-client-ui-sidebar-documentpreview/src/client/html/locales.ts'
import type { LocaleNamespaceMap } from '@deepseek-ai/dsh-client-ui-slots'

/** Russian dictionary, checked complete against the documentHtml namespace key union. */
export const ru = {
  'title': 'HTML',
  'frame': 'Предпросмотр документа HTML',
  'loading': 'Чтение…',
  'failed': 'Не удалось показать этот документ HTML.',
} satisfies Record<LocaleNamespaceMap['documentHtml'], string>
