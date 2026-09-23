/** ru dictionary for the `sidebarOffice` namespace: the Office document preview renderer. */

import type {} from '@deepseek-ai/dsh-client-ui-sidebar-documentpreview/src/client/office/index.ts'
import type { LocaleNamespaceMap } from '@deepseek-ai/dsh-client-ui-slots'

/** Russian dictionary, checked complete against the sidebarOffice namespace key union. */
export const ru = {
  title: 'Документ Office',
  loading: 'Чтение…',
  retry: 'Повторить',
  viewMissingFonts: 'Не хватает шрифтов: {count}. Нажмите, чтобы посмотреть.',
  missingFontsTitle: 'Отсутствующие шрифты',
  missingFontsDescription: 'Эти шрифты недоступны для текущего предпросмотра. Текст и вёрстка могут отличаться от исходного документа.',
  missingFontsCount: 'Шрифтов: {count}',
  closeDetails: 'Закрыть сведения о шрифтах',
  unavailable: 'Предпросмотр Office недоступен. Включите службу предпросмотра документов на компьютере, где работает DeepSeek Harness.',
  invalid: 'Этот файл Office нельзя показать. Возможно, он повреждён, защищён паролем или его расширение не совпадает с содержимым.',
  tooLarge: 'Файл Office или преобразованный PDF превышает предел размера для предпросмотра. Уменьшите файл или измените настройки предпросмотра.',
  failed: 'Преобразование Office не дало пригодного PDF. Проверьте файл и повторите попытку.',
  timeout: 'Время преобразования Office истекло. Повторите попытку.',
  busy: 'Предпросмотр Office занят. Повторите попытку чуть позже.',
  changed: 'Файл изменился во время чтения. Откройте предпросмотр заново.',
} satisfies Record<LocaleNamespaceMap['sidebarOffice'], string>
