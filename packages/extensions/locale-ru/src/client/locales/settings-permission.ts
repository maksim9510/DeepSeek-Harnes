/** ru dictionary for the `settings.permission` namespace: the Permission settings row's copy. */

import type {} from '@deepseek-ai/dsh-client-ui-permission-presets/client'
import type { LocaleNamespaceMap } from '@deepseek-ai/dsh-client-ui-slots'

/** Russian dictionary, checked complete against the settings.permission namespace key union. */
export const ru = {
  'title': 'Разрешения',
  'description': 'Выберите режим разрешений по умолчанию для новых сессий',
  'loading': 'Загрузка',
  'unavailable': 'Недоступно',
  'preset.readOnly': 'Только чтение',
  'preset.workspaceWrite': 'Запись в рабочее пространство',
  'preset.fullAccess': 'Полный доступ',
  'confirm.title': 'Включить полный доступ?',
  'confirm.description': 'Полный доступ позволяет новым сессиям сократить число подтверждений и выполнять больше действий напрямую, включая чувствительные операции, изменение файлов и внешние команды. Используйте его, только если вы доверяете последующим задачам.',
  'confirm.acknowledge': 'Я понимаю риски и хочу продолжить',
  'confirm.cancel': 'Отмена',
  'confirm.enable': 'Включить полный доступ',
} satisfies Record<LocaleNamespaceMap['settings.permission'], string>
