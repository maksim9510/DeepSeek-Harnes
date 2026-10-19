/** ru dictionary for the `settings.webSearch` namespace: the web search provider settings card. */

import type {} from '@deepseek-ai/dsh-client-ui-settings-web-search/client'
import type { LocaleNamespaceMap } from '@deepseek-ai/dsh-client-ui-slots'

/** Russian dictionary, checked complete against the settings.webSearch namespace key union. */
export const ru = {
  title: 'Поиск в сети',
  description: 'Настройка провайдера поиска DeepSeek.',
  useSearchApi: 'Использовать новый Web Search API',
  useSearchApiHint: 'По умолчанию выключено: поиск выполняется через DeepSeek Messages. О возможностях и стоимости нового Web Search API см. ',
  searchGuide: 'Руководство по поиску и извлечению',
  searchGuideUrl: 'https://api-docs.deepseek.com/guides/search',
  apiKey: 'API-ключ',
  apiKeyHint: 'Не сохраняется в файле настроек. Оставьте пустым, чтобы сохранить текущий ключ.',
  apiKeySet: 'Ключ настроен.',
  apiKeyUnset: 'Ключ не настроен; поиск доступен только для диалогов с моделью учётной записи DeepSeek через эндпоинт по умолчанию.',
  baseUrl: 'Адрес эндпоинта',
  baseUrlHint: 'Оставьте пустым для адреса провайдера по умолчанию.',
  maxUses: 'Макс. поисковых запросов за обращение',
  maxUsesHint: 'Сколько раз за один запрос модель может выполнить поиск перед тем, как ответить.',
  searchApiBaseUrl: 'Адрес эндпоинта Search / Fetch API',
  searchApiBaseUrlHint: 'Укажите префикс API, например https://api.deepseek.com/v1/tools. Провайдер добавляет /search или /fetch. Оставьте пустым для значения по умолчанию.',
  count: 'Результатов за поиск',
  countHint: 'Количество результатов на запрос: целое число от 1 до 50, по умолчанию 10. Это управляет количеством результатов, а не вызовов поиска. web_search сохраняет не больше источников, чем его собственный лимит результатов.',
  overridden: 'Переопределено',
  reset: 'Сбросить по умолчанию',
  readOnly: 'В этом развёртывании настройки доступны только для чтения.',
  unavailable: 'Плагин не загружен, поэтому его настройка сейчас недоступна.',
  save: 'Сохранить',
  saving: 'Сохранение…',
  saveFailed: 'Развёртывание не приняло эти значения; они оставлены для исправления.',
  invalidNumber: 'Введите число или оставьте пустым для значения по умолчанию.',
  invalidCount: 'Введите целое число от 1 до 50 или оставьте пустым для значения по умолчанию.',
} satisfies Record<LocaleNamespaceMap['settings.webSearch'], string>
