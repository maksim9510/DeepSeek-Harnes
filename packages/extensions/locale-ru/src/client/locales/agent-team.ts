/** ru dictionary for the `agent-team` namespace: the Agent Teams roster and shared task board. */

import type {} from '@deepseek-ai/dsh-experimental-client-ui-agent-team/client'
import type { LocaleNamespaceMap } from '@deepseek-ai/dsh-client-ui-slots'

/** Russian dictionary, checked complete against the agent-team namespace key union. */
export const ru = {
  'trigger': 'Команда агентов',
  'refresh': 'Обновить команду',
  'close': 'Закрыть',
  'loading': 'Загрузка команды…',
  'empty': 'Общих задач пока нет',
  'roster': 'Участники',
  'tasks': 'Общие задачи',
  'model': 'Модель',
  'open': 'Открыть сессию участника',
  'create': 'Новая задача',
  'subject': 'Заголовок задачи',
  'description': 'Описание задачи',
  'blockers': 'ID задач-зависимостей (через запятую)',
  'scopes': 'Области записи (через запятую)',
  'save': 'Сохранить',
  'cancel': 'Отмена',
  'edit': 'Изменить',
  'complete': 'Завершить',
  'reopen': 'Открыть заново',
  'delete': 'Удалить',
  'owner': 'Владелец',
  'unowned': 'Нет владельца',
  'blockedBy': 'Зависит от',
  'writeScopes': 'Области записи',
  'ready': 'Готова к работе',
  'blocked': 'Заблокирована зависимостями',
  'conflict': 'Состояние задачи изменилось, данные перезагружены. Проверьте их и повторите попытку.',
  'memberStatus.running': 'Работает',
  'memberStatus.idle': 'Без задачи',
  'memberStatus.inactive': 'Не запущен',
  'memberStatus.provisioning': 'Подготовка',
  'memberStatus.failed': 'Ошибка',
  'status.pending': 'Ожидает',
  'status.in_progress': 'В работе',
  'status.completed': 'Завершена',
} satisfies Record<LocaleNamespaceMap['agent-team'], string>
