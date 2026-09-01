/** ru dictionary for the `session-log-download` namespace: the Session export download dialog's copy. */

import type {} from '@deepseek-ai/dsh-session-log-export/client'
import type { LocaleNamespaceMap } from '@deepseek-ai/dsh-client-ui-slots'

/** Russian dictionary, checked complete against the session-log-download namespace key union. */
export const ru = {
  'header.action': 'Журнал сессии',
  'dialog.preparingTitle': 'Экспорт сессии',
  'dialog.preparingDescription': 'Готовится ZIP-архив с текущей сессией, её суб-сессиями и вложениями.',
  'dialog.successTitle': 'Скачивание сессии началось',
  'dialog.successDescription': 'Браузер скачивает ZIP-архив сессии.',
  'dialog.errorTitle': 'Не удалось экспортировать сессию',
  'dialog.close': 'Закрыть',
  'dialog.commandFailed': 'Не удалось запустить экспорт сессии.',
} satisfies Record<LocaleNamespaceMap['session-log-download'], string>
