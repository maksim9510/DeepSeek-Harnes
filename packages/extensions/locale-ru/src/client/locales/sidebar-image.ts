/** ru dictionary for the `sidebarImage` namespace: the image preview renderer. */

import type {} from '@deepseek-ai/dsh-client-ui-sidebar-documentpreview/src/client/image/locales.ts'
import type { LocaleNamespaceMap } from '@deepseek-ai/dsh-client-ui-slots'

/** Russian dictionary, checked complete against the sidebarImage namespace key union. */
export const ru = {
  title: 'Изображение',
  preview: 'Предпросмотр изображения: {name}',
  loading: 'Чтение…',
  failed: 'Не удалось показать это изображение.',
  unsupported: 'Для предпросмотра изображения нужен полный файл.',
  zoomControls: 'Управление масштабом',
  zoomMenu: 'Выбор масштаба',
  zoomOut: 'Уменьшить масштаб',
  zoomIn: 'Увеличить масштаб',
  zoomFitWidth: 'Вписать по ширине',
  zoomValue: '{percent}%',
} satisfies Record<LocaleNamespaceMap['sidebarImage'], string>
