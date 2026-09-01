/** ru dictionary for the `settings.pluginInventory` namespace: the read-only plugin inventory settings tab. */

import type {} from '@deepseek-ai/dsh-client-ui-settings-plugin-inventory/client'
import type { LocaleNamespaceMap } from '@deepseek-ai/dsh-client-ui-slots'

/** Russian dictionary, checked complete against the settings.pluginInventory namespace key union. */
export const ru = {
  'tab': 'Список плагинов',
  'loading': 'Чтение плагинов…',
  'error': 'Плагины временно недоступны.',
  'retry': 'Повторить',
  'search': 'Поиск плагинов',
  'empty': 'Нет доступных плагинов.',
  'emptySearch': 'Нет подходящих плагинов.',
  'presetTitle': 'Плагины сессии',
  'presetSubtitle': 'Формируются для каждой сессии пресетами агентов',
  'countUnit': 'плагинов',
  'switcherLabel': 'Выберите пресет агента для просмотра',
  'presetOptionDefault': '{name} (по умолчанию)',
  'presetOptionBroken': '{name} (не удалось загрузить)',
  'globalTitle': 'Глобальные плагины',
  'globalSubtitle': 'Общие для системы и всех сессий',
  'presetProvidedDetail': 'Отключён глобально; пресеты агентов подключают его для каждой сессии',
  'enabledIn': 'Включён в',
  'viewInPreset': 'Просмотреть в группе пресета',
  'matchesInOtherPresets': 'Ещё {count} совпадений в других пресетах: ',
  'failedCountLabel': 'с ошибкой запуска',
  'enabledTag': 'Включён',
  'disabledTag': 'Отключён',
  'conditionalTag': 'Условно включён',
  'presetEnabledTag': 'Включён пресетами',
  'failedTag': 'Не удалось запустить',
  'moduleLabel': 'Полное имя',
  'fromPreset': 'Из',
  'condition': 'Условие отключения',
  'configuration': 'Конфигурация',
  'runtime': 'Статус',
  'unobserved': 'Не выполняется',
  'pending': 'Ожидает зависимости',
  'loadingPhase': 'Загружается',
  'active': 'Выполняется',
  'failed': 'Не удалось запустить',
  'unloading': 'Выгружается',
} satisfies Record<LocaleNamespaceMap['settings.pluginInventory'], string>
