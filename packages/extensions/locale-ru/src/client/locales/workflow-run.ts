/** ru dictionary for the `workflowRun` namespace: the durable workflow-run panel copy. */

import type {} from '@deepseek-ai/dsh-client-ui-workflow-run/client'
import type { LocaleNamespaceMap } from '@deepseek-ai/dsh-client-ui-slots'

/** Russian dictionary, checked complete against the workflowRun namespace key union. */
export const ru = {
  'run.title': '{name}',
  'run.members.one': '{count} участник',
  'run.members.other': '{count} участников',
  'run.empty': 'Ни один участник не запущен',
  'phase.unassigned': 'Без этапа',
  'phase.empty': 'Пустое название этапа',
  'statusCount.running': 'Выполняется: {count}',
  'statusCount.completed': 'Завершено: {count}',
  'statusCount.failed': 'Не удалось: {count}',
  'statusCount.cancelled': 'Отменено: {count}',
  'statusCount.interrupted': 'Прервано: {count}',
  'member.empty': 'Пустое имя участника',
  'member.open': 'Открыть {name}',
  'status.running': 'Выполняется',
  'status.completed': 'Завершено',
  'status.failed': 'Не удалось',
  'status.cancelled': 'Отменено',
  'status.interrupted': 'Прервано',
} satisfies Record<LocaleNamespaceMap['workflowRun'], string>
