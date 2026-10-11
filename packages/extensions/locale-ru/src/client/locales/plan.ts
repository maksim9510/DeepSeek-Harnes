/** ru dictionary for the `plan` namespace: the composer plan chip's copy. */

import type {} from '@deepseek-ai/dsh-client-ui-plan/client'
import type { LocaleNamespaceMap } from '@deepseek-ai/dsh-client-ui-slots'

/** Russian dictionary, checked complete against the plan namespace key union. */
export const ru = {
  'chip.label': 'План',
  'preview.title': 'План',
  'preview.document': 'План · Markdown',
  'preview.action': 'Открыть',
  'preview.open': 'Открыть план в боковой панели',
  'preview.full': 'Открыть весь план',
  'preview.openNamed': 'Открыть план: {title}',
  'preview.loading': 'Загрузка плана…',
  'preview.failed': 'Не удалось загрузить план',
  'preview.invalidAddress': 'Недопустимый адрес плана',
  'preview.historyUnavailable': 'История сессии недоступна',
  'preview.notFound': 'План не найден',
  'preview.unavailable': 'Предпросмотр плана недоступен',
  'preview.expired': 'Временный предпросмотр плана истёк. Откройте его снова из карточки ожидающего просмотра.',
  'chip.on.aria': 'Режим плана включён, нажмите, чтобы выключить',
  'chip.on.title': 'Режим плана включён — нажмите, чтобы выключить (/plan off)',
  'chip.exitFailed': 'Не удалось выйти из режима плана',
} satisfies Record<LocaleNamespaceMap['plan'], string>
