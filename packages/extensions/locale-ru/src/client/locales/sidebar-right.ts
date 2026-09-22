/** ru dictionary for the `sidebarRight` namespace: right-sidebar chrome, docking vocabulary, and guide copy. */

import type {} from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import type { LocaleNamespaceMap } from '@deepseek-ai/dsh-client-ui-slots'

/** Russian dictionary, checked complete against the sidebarRight namespace key union. */
export const ru = {
  'chrome.expand': 'Открыть боковую панель',
  'chrome.expandAria': 'Открыть правую боковую панель',
  'chrome.collapse': 'Свернуть боковую панель',
  'chrome.collapseAria': 'Свернуть правую боковую панель',
  'chrome.toFullscreen': 'На весь экран',
  'chrome.exitFullscreen': 'Выйти из полноэкранного режима',
  'dock.emptyPane': 'Пустая панель',
  'dock.splitPane': 'Разделить',
  'dock.splitPaneDisabled': 'Больше двух панелей нельзя',
  'dock.splitPaneNarrow': 'Недостаточно ширины для разделения, расширьте боковую панель',
  'dock.closeTab': 'Закрыть',
  'dock.addTab': 'Новая вкладка',
  'dock.dockFloat': 'Вернуть в боковую панель',
  'dock.closeFloat': 'Закрыть',
  'dock.drop.center': 'Переместить сюда',
  'dock.drop.left': 'Добавить панель слева',
  'dock.drop.right': 'Добавить панель справа',
  'dock.drop.top': 'Добавить панель сверху',
  'dock.drop.bottom': 'Добавить панель снизу',
  'tab.guide.title': 'Начало',
  'tab.unavailable': 'Для такого содержимого пока нет доступного способа просмотра.',
} satisfies Record<LocaleNamespaceMap['sidebarRight'], string>
