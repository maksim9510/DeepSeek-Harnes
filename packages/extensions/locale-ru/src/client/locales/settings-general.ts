/** ru dictionary for the `settings` namespace: shell chrome, the General nav item, and connection copy. */

import type {} from '@deepseek-ai/dsh-client-ui-settings-general/client'
import type { LocaleNamespaceMap } from '@deepseek-ai/dsh-client-ui-slots'

/** Russian dictionary, checked complete against the settings namespace key union. */
export const ru = {
  'trigger': 'Настройки',
  'title': 'Настройки',
  'close': 'Закрыть',
  'openDocument': 'Открыть файл конфигурации',
  'openDocument.error': 'Не удалось открыть файл конфигурации',
  'general.nav': 'Общие',
  'connection.error': 'Нет подключения',
  'connection.retry': 'Переподключиться сейчас',
  'connection.connecting': 'Подключение',
  'connection.connected': 'Подключено',
  'connection.reconnect': 'Нет подключения, переподключиться сейчас',
  'connection.restart': 'Подключение, перезапустить сейчас',
} satisfies Record<LocaleNamespaceMap['settings'], string>
