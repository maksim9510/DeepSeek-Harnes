/** ru dictionary for the `settings.subagent` namespace: the Subagent settings page. */

import type {} from '@deepseek-ai/dsh-client-ui-settings-subagent/client'
import type { LocaleNamespaceMap } from '@deepseek-ai/dsh-client-ui-slots'

/** Russian dictionary, checked complete against the settings.subagent namespace key union. */
export const ru = {
  overridden: 'Переопределено',
  reset: 'Сбросить по умолчанию',
  readOnly: 'В этом развёртывании настройки доступны только для чтения.',
  unavailable: 'Плагин не загружен, поэтому его настройка сейчас недоступна.',
  save: 'Сохранить',
  saving: 'Сохранение…',
  saveFailed: 'Развёртывание не приняло эти значения; они оставлены для исправления.',
  subagentTitle: 'Субагент',
  subagentDescription: 'Настройка глубины рекурсии, количества и моделей субагентов.',
  subagentLimitsTitle: 'Ограничения',
  subagentMaxDepth: 'Максимальная глубина рекурсии',
  subagentDepthHelpLabel: 'О максимальной глубине рекурсии',
  subagentDepthHelp: 'Ограничивает количество уровней вложенности субагентов, создаваемых агентом.',
  subagentDepthZero: 'Отключить субагентов',
  subagentDepthOne: 'Только основной агент может создавать субагентов',
  subagentDepthOverride: 'Если инструмент определяет собственную максимальную глубину рекурсии, приоритет отдаётся его настройке.',
  subagentMaxActive: 'Лимит параллельности субагентов',
  subagentCapacityHelpLabel: 'О лимите параллельности субагентов',
  subagentCapacityHelp: 'Общее число активных субагентов под управлением одного основного агента на всех уровнях рекурсии (основной агент не учитывается). При достижении лимита новые запросы на запуск отклоняются.',
  subagentDepthInvalid: 'Введите целое число 0 или больше.',
  subagentCapacityInvalid: 'Введите целое число 1 или больше.',
  subagentModelSelectionTitle: 'Выбор модели',
  subagentModelSelectionToggle: 'Разрешить агентам выбирать модели для субагентов',
  subagentModelSelectionChoose: 'Если включено, агенты могут выбирать провайдера, модель и уровень рассуждений для каждого субагента из списка разрешённых моделей ниже. Применяется только к новым сессиям.',
  subagentModelSelectionAllowed: 'Модели, доступные для выбора агентами',
  subagentModelSelectionLoading: 'Загрузка моделей…',
  subagentModelSelectionLoadFailed: 'Не удалось загрузить модели.',
  subagentModelSelectionRetry: 'Повторить',
  subagentModelSelectionPartial: 'Некоторые провайдеры моделей не загрузились; сохранённый выбор можно удалить.',
  subagentModelSelectionUnavailable: 'Сейчас недоступно',
  subagentModelSelectionUnavailableGroup: 'Сохранено, но сейчас недоступно',
  subagentModelSelectionEmpty: 'В настоящее время ни один провайдер не предоставляет моделей.',
  subagentModelSelectionRequired: 'Выберите хотя бы одну модель перед сохранением.',
  subagentModelSelectionConflict: 'Настройки были изменены в другом месте. Отмените черновик и повторите попытку.',
  subagentModelSelectionOff: 'Субагенты используют настройки по умолчанию или наследуют модель родительского агента. Сохранённые модели сохраняются.',
} satisfies Record<LocaleNamespaceMap['settings.subagent'], string>
