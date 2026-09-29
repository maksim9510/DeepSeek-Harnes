/** ru dictionary for the `settings.sessionLog` namespace: the Session-log upload preference copy. */

// The built ./client index does not re-export the key union, so the merge is
// unreachable from a foreign package; import the owning module directly.
import type { en } from '@deepseek-ai/dsh-client-ui-settings-session-log/src/client/locales.ts'

/** Russian dictionary, checked complete against the settings.sessionLog namespace key union. */
export const ru = {
  title: 'Загружать журнал сессии при использовании официального API моделей',
  description: 'Помогает улучшать модели и продукты DeepSeek.',
  saved: 'Настройка сохранена',
  failed: 'Не удалось сохранить настройку',
} satisfies Record<keyof typeof en, string>
