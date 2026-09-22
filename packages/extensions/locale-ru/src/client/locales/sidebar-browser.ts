/** ru dictionary for the `sidebarBrowser` namespace: the right-sidebar Browser panel. */

import type {} from '@deepseek-ai/dsh-client-ui-sidebar-browser/client'
import type { LocaleNamespaceMap } from '@deepseek-ai/dsh-client-ui-slots'

/** Russian dictionary, checked complete against the sidebarBrowser namespace key union. */
export const ru = {
  'type.label': 'Браузер',
  'guide.title': 'Браузер',
  'guide.description': 'Просмотр страниц HTTP(S)',
  'address.placeholder': 'Введите адрес HTTP(S)',
  'address.changed': 'URL изменился',
  'back': 'Назад',
  'forward': 'Вперёд',
  'reload': 'Обновить',
  'go': 'Перейти',
  'external': 'Открыть в системном браузере',
  'sandbox.disable': 'Отключить ограничения песочницы',
  'sandbox.enable': 'Вернуть ограничения песочницы',
  'sandbox.warning': 'Ограничения песочницы отключены: страница может управлять переходами приложения верхнего уровня, а также использовать загрузки, модальные диалоги и блокировку ввода.',
  'start': 'Введите адрес HTTP(S), чтобы начать просмотр',
  'loading': 'Открытие…',
  'error.empty': 'Введите адрес.',
  'error.invalid': 'Этот адрес недействителен или слишком длинный.',
  'error.protocol': 'Поддерживаются только адреса HTTP и HTTPS; для локальных файлов используйте предпросмотр документов.',
  'error.credentials': 'Адрес не может содержать имя пользователя или пароль.',
  'error.application-origin': 'Встроенный браузер не может открыть само приложение DSH.',
  'web.loadFailed': 'Страница сообщила об ошибке загрузки или может запрещать встраивание; попробуйте открыть её в системном браузере.',
  'web.unknown': 'Страница перешла внутри iframe; веб-режим не может прочитать её текущий URL.',
} satisfies Record<LocaleNamespaceMap['sidebarBrowser'], string>
