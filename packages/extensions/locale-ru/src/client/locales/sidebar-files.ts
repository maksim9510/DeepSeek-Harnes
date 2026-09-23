/** ru dictionary for the `sidebarFiles` namespace: the right-sidebar workspace file tree. */

import type {} from '@deepseek-ai/dsh-client-ui-sidebar-files/client'
import type { LocaleNamespaceMap } from '@deepseek-ai/dsh-client-ui-slots'

/** Russian dictionary, checked complete against the sidebarFiles namespace key union. */
export const ru = {
  'type.label': 'Файлы',
  'guide.title': 'Файлы рабочего пространства',
  'guide.description': 'Просмотр файлов в рабочем пространстве этой сессии',
  loading: 'Чтение…',
  empty: 'Пустой каталог',
  truncated: 'Слишком много записей, показана только часть.',
  noWorkspace: 'У этой сессии нет каталога рабочего пространства.',
  reload: 'Обновить',
  autoRefresh: 'Автообновление',
  'autoRefresh.enable': 'Включить автообновление',
  'autoRefresh.disable': 'Выключить автообновление',
  'entry.other': 'Это не файл и не каталог, открыть его нельзя.',
  'error.notFound': 'Этот каталог исчез. Возможно, он перемещён или удалён.',
  'error.outsideWorkspace': 'Этот каталог находится вне рабочего пространства, поэтому боковая панель его не читает.',
  'error.notDirectory': 'Это не каталог.',
  'error.unavailable': 'Не удалось прочитать: {message}',
} satisfies Record<LocaleNamespaceMap['sidebarFiles'], string>
