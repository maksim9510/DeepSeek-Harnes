/** ru dictionary for the `feedback` namespace: the per-message feedback dialog and category copy. */

import type {} from '@deepseek-ai/dsh-client-ui-message-feedback/client'
import type { LocaleNamespaceMap } from '@deepseek-ai/dsh-client-ui-slots'

/** Russian dictionary, checked complete against the feedback namespace key union. */
export const ru = {
  'action.like': 'Хороший ответ',
  'action.likeActive': 'Убрать оценку',
  'action.dislike': 'Плохой ответ',
  'action.dislikeActive': 'Убрать оценку',
  'dialog.title': 'Отправить отзыв',
  'dialog.categories': 'Категория отзыва',
  'dialog.detail': 'Подробности отзыва',
  'dialog.hint': 'Добавьте подробности, чтобы помочь нам улучшить сервис. В отзыв будет включён журнал текущего диалога.',
  'category.task-result': 'Результат задачи',
  'category.instruction-following': 'Понимание и выполнение инструкций',
  'category.product-interaction': 'Функции и взаимодействие продукта',
  'category.service-stability': 'Стабильность сервиса',
  'category.resource-cost': 'Использование ресурсов и стоимость',
  'category.security-privacy-permission': 'Безопасность, конфиденциальность и разрешения',
  'category.other': 'Другое',
  'toast.recorded': 'Спасибо за отзыв',
  'error.conflict': 'Этот отзыв изменён в другом месте; показано актуальное состояние',
  'error.load': 'Не удалось загрузить отзыв',
  'error.generic': 'Не удалось сохранить отзыв',
  'error.noteTooLarge': 'Описание слишком длинное; сократите его и отправьте снова',
} satisfies Record<LocaleNamespaceMap['feedback'], string>
