/** ru dictionary for the `settings.agentLoop` namespace: the agent loop settings card. */

import type {} from '@deepseek-ai/dsh-client-ui-settings-agent-loop/client'
import type { LocaleNamespaceMap } from '@deepseek-ai/dsh-client-ui-slots'

/** Russian dictionary, checked complete against the settings.agentLoop namespace key union. */
export const ru = {
  title: 'Цикл агента',
  description: 'Управление тем, как агент отправляет вызовы инструментов.',
  maxParallel: 'Параллельные вызовы инструментов',
  maxParallelHint: 'Верхний предел параллельных вызовов, выполняемых одновременно в рамках одного шага.',
  overridden: 'Переопределено',
  reset: 'Сбросить по умолчанию',
  readOnly: 'В этом развёртывании настройки доступны только для чтения.',
  unavailable: 'Плагин не загружен, поэтому его настройка сейчас недоступна.',
  save: 'Сохранить',
  saving: 'Сохранение…',
  saveFailed: 'Развёртывание не приняло эти значения; они оставлены для исправления.',
  invalidNumber: 'Введите число или оставьте пустым для значения по умолчанию.',
} satisfies Record<LocaleNamespaceMap['settings.agentLoop'], string>
