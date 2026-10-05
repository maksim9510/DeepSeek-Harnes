/** ru dictionary for the `settings.webSearch` namespace: the web search provider settings card. */

import type {} from '@deepseek-ai/dsh-client-ui-settings-web-search/client'
import type { LocaleNamespaceMap } from '@deepseek-ai/dsh-client-ui-slots'

/** Russian dictionary, checked complete against the settings.webSearch namespace key union. */
export const ru = {
  title: 'Поиск в сети',
  description: 'Настройка провайдера поиска DeepSeek.',
  apiKey: 'API-ключ',
  apiKeyHint: 'Не сохраняется в файле настроек. Оставьте пустым, чтобы сохранить текущий ключ.',
  apiKeySet: 'Ключ настроен.',
  apiKeyUnset: 'Ключ не настроен; поиск доступен только для диалогов с моделью учётной записи DeepSeek через эндпоинт по умолчанию.',
  baseUrl: 'Адрес эндпоинта',
  baseUrlHint: 'Оставьте пустым для адреса провайдера по умолчанию.',
  maxUses: 'Макс. поисковых запросов за обращение',
  maxUsesHint: 'Сколько раз за один запрос модель может выполнить поиск перед тем, как ответить.',
  overridden: 'Переопределено',
  reset: 'Сбросить по умолчанию',
  readOnly: 'В этом развёртывании настройки доступны только для чтения.',
  unavailable: 'Плагин не загружен, поэтому его настройка сейчас недоступна.',
  save: 'Сохранить',
  saving: 'Сохранение…',
  saveFailed: 'Развёртывание не приняло эти значения; они оставлены для исправления.',
  invalidNumber: 'Введите число или оставьте пустым для значения по умолчанию.',
} satisfies Record<LocaleNamespaceMap['settings.webSearch'], string>
