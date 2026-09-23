/** ru dictionary for the `sidebarDocumentPreview` namespace: the text-preview tab and its failure lines. */

import type {} from '@deepseek-ai/dsh-client-ui-sidebar-documentpreview/client'
import type { LocaleNamespaceMap } from '@deepseek-ai/dsh-client-ui-slots'

/** Russian dictionary, checked complete against the sidebarDocumentPreview namespace key union. */
export const ru = {
  loading: 'Чтение…',
  loadMore: 'Загрузить ещё',
  changed: 'Файл изменился, показано прежнее содержимое.',
  reloadNow: 'Обновить',
  reload: 'Прочитать файл заново',
  autoRefresh: 'Автообновление',
  'autoRefresh.enable': 'Включить автообновление',
  'autoRefresh.disable': 'Выключить автообновление',
  'wrap.enable': 'Включить перенос строк',
  'wrap.disable': 'Отключить перенос строк',
  'wrap.aria': 'Перенос строк',
  openWith: 'Открыть с помощью',
  'viewer.text': 'Обычный текст',
  resourceUnavailable: 'Служба файловых ресурсов недоступна.',
  rendererUnavailable: 'Предпросмотр {name} недоступен.',
  unsupportedFile: 'Предпросмотр для этого типа файлов пока недоступен.',
  'error.notFound': 'Файл не найден. Возможно, он перемещён или удалён.',
  'error.tooLarge': 'Эта страница превышает предел {limit} и не может быть прочитана.',
  'error.notText': 'Предпросмотр для этого типа файлов пока недоступен.',
  'error.notRegularFile': 'Это не обычный файл, показывать нечего.',
  'error.unavailable': 'Не удалось прочитать: {message}',
  retry: 'Повторить',
} satisfies Record<LocaleNamespaceMap['sidebarDocumentPreview'], string>
