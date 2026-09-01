/** ru dictionary for the `sidebar` namespace: shell controls (brand row, New Session, fold toggle). */

import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type { LocaleNamespaceMap } from '@deepseek-ai/dsh-client-ui-slots'

/** Russian dictionary, checked complete against the sidebar namespace key union. */
export const ru = {
  'session.new': 'Новая сессия',
  'session.new.label': 'Новая сессия',
  'toggle.open': 'Открыть боковую панель',
  'toggle.collapse': 'Свернуть боковую панель',
} satisfies Record<LocaleNamespaceMap['sidebar'], string>
