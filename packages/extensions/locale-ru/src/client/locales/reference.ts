/** ru dictionary for the `reference` namespace: the unified `@` reference menu's copy. */

// The built ./client index does not re-export the key union, so the merge is
// unreachable from a foreign package; import the owning module directly.
import type { ReferenceKey } from '@deepseek-ai/dsh-client-ui-reference/src/client/locales.ts'

/** Russian dictionary, checked complete against the reference namespace key union. */
export const ru = {
  'section.files': 'Файлы и папки',
  'section.sessions': 'Сессии',
  'candidate.noCwd': '(нет рабочего каталога)',
  'crumb.root': 'Рабочее пространство',
  'time.now': 'только что',
  'time.minutes': '{n} мин',
  'time.hours': '{n} ч',
  'time.days': '{n} д',
  'time.months': '{n} мес',
  'time.years': '{n} г',
} satisfies Record<ReferenceKey, string>
