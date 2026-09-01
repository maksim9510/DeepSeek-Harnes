/** ru dictionary for the `question` namespace: the question composer and plan-review card copy. */

import type {} from '@deepseek-ai/dsh-client-ui-user-questions/client'
import type { LocaleNamespaceMap } from '@deepseek-ai/dsh-client-ui-slots'

/** Russian dictionary, checked complete against the question namespace key union. */
export const ru = {
  'error.incomplete': 'Сначала ответьте на этот вопрос.',
  'error.unanswered': 'Выберите вариант или введите свой ответ.',
  'nav.prev': 'Предыдущий вопрос',
  'nav.next': 'Следующий вопрос',
  'nav.minimize': 'Свернуть карточку с вопросом',
  'nav.maximize': 'Развернуть карточку с вопросом',
  'nav.cancel': 'Отменить все вопросы',
  'option.recommended': 'Рекомендуется',
  'custom.placeholder': 'Введите свой ответ',
  'action.skip': 'Пропустить этот вопрос',
  'action.next': 'Далее',
  'plan.header': 'Проверка плана',
  'plan.approve': 'Подтвердить',
  'plan.decline': 'Отклонить',
  'plan.discuss': 'Обсудить в чате',
} satisfies Record<LocaleNamespaceMap['question'], string>
