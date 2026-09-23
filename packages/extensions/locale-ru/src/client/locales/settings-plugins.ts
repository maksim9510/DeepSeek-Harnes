/** ru dictionary for the `settings.plugins` namespace: the Plugins settings section and its configurable plugin cards. */

import type {} from '@deepseek-ai/dsh-client-ui-settings-plugins/client'
import type { LocaleNamespaceMap } from '@deepseek-ai/dsh-client-ui-slots'

/** Russian dictionary, checked complete against the settings.plugins namespace key union. */
export const ru = {
  nav: 'Плагины',
  title: 'Плагины',
  intro: 'Настройка и просмотр плагинов, установленных в этом развёртывании.',
  tabs: 'Разделы плагинов',
  empty: 'Это развёртывание не предоставляет настроек плагинов.',
} satisfies Record<LocaleNamespaceMap['settings.plugins'], string>
