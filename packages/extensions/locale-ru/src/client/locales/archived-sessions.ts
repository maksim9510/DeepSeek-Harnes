/** ru dictionary for the `settings.archivedSessions` namespace: the archived-session Settings page. */

import type {} from '@deepseek-ai/dsh-client-ui-settings-unarchive-sessions/client'
import type { LocaleNamespaceMap } from '@deepseek-ai/dsh-client-ui-slots'

/** Russian dictionary, checked complete against the settings.archivedSessions namespace key union. */
export const ru = {
  'nav': 'Архивы сессий',
  'search': 'Поиск в архивах сессий',
  'loading': 'Чтение сессий…',
  'empty': 'В архиве пока нет сессий.',
  'unavailable': 'В архиве нет сессий, которые можно восстановить.',
  'emptySearch': 'Нет подходящих сессий.',
  'unarchive': 'Вернуть из архива',
  'unarchiveNamed': 'Вернуть из архива {title}',
  'ungrouped': 'Без группы',
  'time.now': 'только что',
  'time.minutes': '{n} мин',
  'time.hours': '{n} ч',
  'time.days': '{n} дн',
  'time.months': '{n} мес',
  'time.years': '{n} г',
} satisfies Record<LocaleNamespaceMap['settings.archivedSessions'], string>
