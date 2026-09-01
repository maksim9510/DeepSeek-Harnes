/** ru dictionary for the `feedback` namespace: the per-message feedback controls' copy. */

import type {} from '@deepseek-ai/dsh-client-ui-message-feedback/client'
import type { LocaleNamespaceMap } from '@deepseek-ai/dsh-client-ui-slots'

/** Russian dictionary, checked complete against the feedback namespace key union. */
export const ru = {
  'action.like': 'Хороший ответ',
  'action.likeActive': 'Убрать оценку',
  'action.dislike': 'Плохой ответ',
  'action.dislikeActive': 'Убрать оценку',
  'note.open': 'Добавить комментарий',
  'note.dialog': 'Отзыв',
  'note.placeholder': 'Что было хорошо, а что не так? (необязательно)',
  'note.save': 'Сохранить',
  'note.cancel': 'Отмена',
  'note.aria': 'Комментарий к отзыву',
  'error.conflict': 'Этот отзыв изменён в другом месте; показано актуальное состояние',
  'error.load': 'Не удалось загрузить отзыв',
  'error.generic': 'Не удалось сохранить отзыв',
} satisfies Record<LocaleNamespaceMap['feedback'], string>
