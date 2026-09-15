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
  'auto.badge': 'ЭКСП',
  'auto.confirm.acknowledge': 'Я понимаю эти риски и хочу продолжить',
  'auto.confirm.description': 'Auto review не использует песочницу. Перед каждым нативным вызовом инструмента и внутренним вызовом PTC та же модель, что и текущий агент, проводит проверку. Функция пока экспериментальна: возможны ложные допуски и отказы, а также расход дополнительных токенов.',
  'auto.confirm.enable': 'Включить Auto review',
  'auto.confirm.title': 'Включить Auto review (экспериментально)?',
  'auto.description': 'Запуск без песочницы; каждый нативный вызов инструмента и внутренний вызов PTC предварительно проверяются той же моделью (экспериментально).',
  'auto.label': 'Автопроверка',
  'close': 'Закрыть',
  'mode': 'Режим доступа, текущий: {name}',
} satisfies Record<string, string>
