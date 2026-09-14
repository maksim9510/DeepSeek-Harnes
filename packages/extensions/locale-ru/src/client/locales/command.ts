/** ru dictionary for the `command` namespace: the popupSelect shell's copy. */

import type {} from '@deepseek-ai/dsh-client-ui-commands/client'
import type { LocaleNamespaceMap } from '@deepseek-ai/dsh-client-ui-slots'

/** Russian dictionary, checked complete against the command namespace key union. */
export const ru = {
  'section.add': 'Добавить',
  'section.commands': 'Команды',
  'label.goal': 'Цель',
  'label.plan': 'План',
  'label.feedback': 'Обратная связь',
  'label.compact': 'Сжатие',
  'label.permission': 'Разрешение',
  'label.export': 'Экспорт',
  'token.goal': 'цель',
  'token.plan': 'план',
  'token.feedback': 'обратная связь',
  'token.compact': 'сжатие',
  'token.permission': 'разрешение',
  'token.export': 'экспорт',
  'description.compact': 'Сжать более раннюю историю разговора',
  'description.export': 'Скачать журнал этой сессии в ZIP-архиве',
  'description.feedback': 'отправить отзыв об этой сессии',
  'description.goal': 'задать или посмотреть цель длительной задачи',
  'description.permission': 'Переключить набор разрешений (режим песочницы и политика подтверждения)',
  'description.plan': 'Войти в режим плана или выйти из него',
  'search.placeholder': 'Поиск…',
  'search.aria': 'Фильтр вариантов',
  'status.loading': 'Загрузка вариантов…',
  'status.applying': 'Применение…',
  'status.empty': 'Нет вариантов',
  'overlay.aria': 'Варианты /{command}',
  'listbox.aria': 'Совпадения для /{command}',
  'notice.attachmentsUnsupported': '/{command} не принимает вложения; сначала удалите их',
} satisfies Record<LocaleNamespaceMap['command'], string>
