/** ru dictionary for the `settings.shell` namespace: the shell executor settings card. */

import type {} from '@deepseek-ai/dsh-client-ui-settings-shell/client'
import type { LocaleNamespaceMap } from '@deepseek-ai/dsh-client-ui-slots'

/** Russian dictionary, checked complete against the settings.shell namespace key union. */
export const ru = {
  title: 'Терминал',
  description: 'Ограничение времени выполнения каждой команды и объёма её вывода.',
  timeoutMs: 'Таймаут команды (мс)',
  timeoutMsHint: 'Максимальное время выполнения одной команды до её принудительного завершения.',
  maxOutputBytes: 'Лимит вывода на поток (байт)',
  maxOutputBytesHint: 'Вывод сверх лимита сохраняется во временный файл, а не теряется.',
  overridden: 'Переопределено',
  reset: 'Сбросить по умолчанию',
  readOnly: 'В этом развёртывании настройки доступны только для чтения.',
  unavailable: 'Плагин не загружен, поэтому его настройка сейчас недоступна.',
  save: 'Сохранить',
  saving: 'Сохранение…',
  saveFailed: 'Развёртывание не приняло эти значения; они оставлены для исправления.',
  invalidNumber: 'Введите число или оставьте пустым для значения по умолчанию.',
} satisfies Record<LocaleNamespaceMap['settings.shell'], string>
