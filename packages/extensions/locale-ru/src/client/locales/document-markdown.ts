/** ru dictionary for the `documentMarkdown` namespace: the Markdown preview renderer and its code controls. */

import type {} from '@deepseek-ai/dsh-client-ui-sidebar-documentpreview/src/client/markdown/locales.ts'
import type { LocaleNamespaceMap } from '@deepseek-ai/dsh-client-ui-slots'

/** Russian dictionary, checked complete against the documentMarkdown namespace key union. */
export const ru = {
  'viewer.label': 'Markdown',
  'code.copy': 'Копировать',
  'code.copied': 'Скопировано',
  'footnotes': 'Сноски',
} satisfies Record<LocaleNamespaceMap['documentMarkdown'], string>
