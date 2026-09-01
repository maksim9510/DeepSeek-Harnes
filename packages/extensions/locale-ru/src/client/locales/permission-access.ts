/** ru dictionary for the `permission.access` namespace: the current-session permission popup gate's copy. */

import type {} from '@deepseek-ai/dsh-client-ui-permission-presets/client'

/** Russian dictionary, checked complete against the permission.access zh key set. */
export const ru = {
  'preset.readOnly': 'Только чтение',
  'preset.workspaceWrite': 'Запись в рабочее пространство',
  'preset.fullAccess': 'Полный доступ',
  'confirm.title': 'Включить полный доступ?',
  'confirm.description': 'Полный доступ сокращает шаги подтверждения и позволяет агенту напрямую выполнять больше действий, включая чувствительные операции, изменение файлов и внешние команды. Используйте его, только если вы доверяете текущей задаче.',
  'confirm.acknowledge': 'Я понимаю риски и хочу продолжить',
  'confirm.cancel': 'Отмена',
  'confirm.enable': 'Включить полный доступ',
} satisfies Record<string, string>
