/** ru dictionary for the `job` namespace: the background-jobs trigger badge and status copy. */

import type {} from '@deepseek-ai/dsh-client-ui-jobs/client'
import type { LocaleNamespaceMap } from '@deepseek-ai/dsh-client-ui-slots'

/** Russian dictionary, checked complete against the job namespace key union. */
export const ru = {
  'count.live.one': 'Выполняется {count} фоновая задача',
  'count.live.other': 'Выполняется {count} фоновых задач',
  'count.idle.one': '{count} фоновая задача',
  'count.idle.other': '{count} фоновых задач',
  'list.aria': 'Фоновые задачи',
  'status.running': 'выполняется',
  'status.stopping': 'останавливается',
  'status.completed': 'завершено',
  'status.killed': 'отменено',
  'status.failed': 'не удалось',
  'duration.seconds': '{seconds} с',
  'duration.minutes': '{minutes} мин {seconds} с',
  'duration.hours': '{hours} ч {minutes} мин',
  'duration.title.live': 'Выполняется {duration}',
  'duration.title.done': 'Заняло {duration}',
} satisfies Record<LocaleNamespaceMap['job'], string>
