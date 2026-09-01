/** ru dictionary for the `settings.locale` namespace (the Language row's copy). */

import type {} from '@deepseek-ai/dsh-client-locale/client'
import type { LocaleNamespaceMap } from '@deepseek-ai/dsh-client-ui-slots'

/** Russian dictionary, checked complete against the settings.locale namespace key union. */
export const ru = {
  'language.title': 'Язык',
} satisfies Record<LocaleNamespaceMap['settings.locale'], string>
