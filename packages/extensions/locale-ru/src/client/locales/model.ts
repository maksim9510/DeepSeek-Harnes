/** ru dictionary for the `model` namespace: the /model command, model trigger, and model menu copy. */

import type {} from '@deepseek-ai/dsh-client-ui-model-selection/client'
import type { LocaleNamespaceMap } from '@deepseek-ai/dsh-client-ui-slots'

/** Russian dictionary, checked complete against the model namespace key union. */
export const ru = {
  'command.label': 'Модель',
  'command.description': 'Выбрать модель для этой сессии',
  'option.loadError': 'Не удалось загрузить каталог: {message}',
  'trigger.fallback': 'Выбрать модель',
  'trigger.loading': 'Загрузка моделей…',
  'trigger.selectAria': 'Выбрать модель',
  'trigger.aria': 'Выбрать модель, текущая {model}',
  'trigger.ariaEffort': 'Выбрать модель, текущая {model}, уровень рассуждений {effort}',
  'menu.aria': 'Модель и уровень рассуждений',
  'menu.model': 'Модель',
  'menu.effort': 'Уровень рассуждений',
  'effort.providerDefault': 'По умолчанию',
  'status.loading': 'Обновление списка моделей…',
  'error.action': 'Не удалось выполнить операцию с моделью: {message}',
  'action.reload': 'Обновить',
  'warning.groupLoad': 'Не удалось загрузить {name}: {message}',
  'empty.models': 'Нет доступных моделей.',
  'empty.efforts': 'У этой модели нет уровней рассуждений.',
  'error.sessionInUse': 'This session is already in use, possibly by another running DSH instance (such as dsh web or the desktop app). Quit other running DSH instances and try again.',
  'provider.account': 'Аккаунт DeepSeek',
  'search.clear': 'Clear search',
  'search.empty': 'No matching models.',
  'search.placeholder': 'Search models…',
} satisfies Record<LocaleNamespaceMap['model'], string>
