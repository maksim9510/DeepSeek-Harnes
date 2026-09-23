/** ru dictionary for the `sidebarPdf` namespace: the PDF preview renderer. */

import type {} from '@deepseek-ai/dsh-client-ui-sidebar-documentpreview/src/client/pdf/locales.ts'
import type { LocaleNamespaceMap } from '@deepseek-ai/dsh-client-ui-slots'

/** Russian dictionary, checked complete against the sidebarPdf namespace key union. */
export const ru = {
  zoomControls: 'Управление масштабом',
  zoomMenu: 'Выбрать масштаб',
  zoomOut: 'Уменьшить',
  zoomIn: 'Увеличить',
  zoomFitWidth: 'По ширине',
  zoomValue: '{percent}%',
  title: 'PDF',
  pageImage: 'Страница {page} PDF',
  loading: 'Чтение…',
  rendering: 'Отрисовка страницы…',
  failed: 'Не удалось показать PDF: {message}',
  password: 'Для этого PDF нужен пароль; предпросмотр защищённых файлов не поддерживается.',
  workerFailed: 'Процесс отрисовки PDF не смог продолжить работу. Повторите попытку.',
  unsupported: 'Для предпросмотра PDF нужен полный файл.',
  retry: 'Повторить',
} satisfies Record<LocaleNamespaceMap['sidebarPdf'], string>
