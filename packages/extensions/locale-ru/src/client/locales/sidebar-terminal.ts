/** ru dictionary for the `sidebarTerminal` namespace: right-sidebar terminal sessions. */

import type {} from '@deepseek-ai/dsh-client-ui-sidebar-terminal/src/client/locales.ts'
import type { LocaleNamespaceMap } from '@deepseek-ai/dsh-client-ui-slots'

/** Russian dictionary, checked complete against the sidebarTerminal namespace key union. */
export const ru = {
  'recoveryFailed': 'Не удалось восстановить терминал: {message}',
  'retryRecovery': 'Повторить восстановление терминала',
  'shell': 'Выбрать оболочку',
  'shellLoading': 'Загрузка оболочек…',
  'shellEmpty': 'Нет доступных оболочек',
  'description': 'Выполнять команды в рабочей области сессии',
  'title': 'Терминал',
  'new': 'Новый терминал',
  'loading': 'Чтение среды терминала…',
  'creating': 'Запуск…',
  'connecting': 'Подключение…',
  'disconnected': 'Соединение разорвано.',
  'reconnect': 'Переподключиться',
  'readonly': 'Эта страница сейчас доступна только для чтения.',
  'control': 'Взять управление',
  'closed': 'Терминал закрыт.',
  'exited': 'Процесс завершился ({code})',
  'failed': 'Ошибка терминала: {message}',
  'rename': 'Название терминала',
  'unavailable': 'Недоступно',
  'retry': 'Повторить',
  'cleanupFailed': 'Не удалось завершить терминал «{title}»: {message}',
  'missingTerminal': 'Этот терминал больше не существует. Создайте новый терминал.',
  'inputFull': 'Буфер ввода заполнен. Переподключитесь и повторите попытку.',
  'attachmentEnded': 'Соединение с терминалом завершено. Переподключитесь, чтобы продолжить.',
  'invalidOutput': 'Не удалось получить изображение экрана терминала. Переподключитесь, чтобы восстановить его.',
  'terminalLimit': 'Достигнут предел числа терминалов. Закройте неиспользуемые терминалы и повторите попытку. Завершённые терминалы тоже учитываются.',
} satisfies Record<LocaleNamespaceMap['sidebarTerminal'], string>
