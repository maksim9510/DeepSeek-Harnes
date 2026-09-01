/** ru dictionary for the `schedule.catalog` namespace: the Schedule trigger badge and reminder catalog rows. */

import type {} from '@deepseek-ai/dsh-client-ui-schedule/client'
import type { LocaleNamespaceMap } from '@deepseek-ai/dsh-client-ui-slots'

/** Russian dictionary, checked complete against the schedule.catalog namespace key union. */
export const ru = {
  'trigger.one': '{count} напоминание',
  'trigger.other': '{count} напоминаний',
  'list.aria': 'Активные напоминания',
  'status.scheduled': 'Запланировано',
  'status.overdue': 'Просрочено',
  'frequency.once': 'Однократно',
  'frequency.every': 'Каждые {value} {unit}',
  'unit.day.one': 'день',
  'unit.day.other': 'дней',
  'unit.hour.one': 'час',
  'unit.hour.other': 'часов',
  'unit.minute.one': 'минута',
  'unit.minute.other': 'минут',
  'unit.second.one': 'секунда',
  'unit.second.other': 'секунд',
  'relative.now': 'Срок наступил',
  'relative.future': 'через {value} {unit}',
  'relative.overdue': 'Просрочено на {value} {unit}',
} satisfies Record<LocaleNamespaceMap['schedule.catalog'], string>
