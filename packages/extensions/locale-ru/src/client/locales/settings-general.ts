/** ru dictionary for the `settings` namespace: shell chrome, the General nav item, and connection copy. */

import type {} from '@deepseek-ai/dsh-client-ui-settings-general/client'
import type { LocaleNamespaceMap } from '@deepseek-ai/dsh-client-ui-slots'

/** Russian dictionary, checked complete against the settings namespace key union. */
export const ru = {
  trigger: 'Настройки',
  'desktop.update.available': 'Обновление',
  'desktop.update.checking': 'Проверка обновлений…',
  'desktop.update.progress': '{percent}%…',
  'desktop.update.verifying': 'Проверка файлов обновления…',
  'desktop.update.installing': 'Подготовка к перезапуску…',
  'desktop.update.ready': 'Установить и перезапустить',
  'desktop.update.retry': 'Повторить обновление',
  'desktop.update.versionDetail': '{label} — V{version}',
  'desktop.update.downloadDetail': 'Downloading update: {percent}%\\nTarget version: V{version}',
  'desktop.update.checkFailed': 'Не удалось проверить обновления. Повторите попытку позже.',
  'desktop.update.downloadFailed': 'Не удалось загрузить обновление. Попробуйте ещё раз.',
  'desktop.update.installFailed': 'Не удалось установить обновление. Повторите попытку позже.',
  'desktop.update.checkNetworkFailed': 'Could not check for updates. Please try again later. The connection was interrupted. Check your network and try again.',
  'desktop.update.downloadNetworkFailed': 'Could not download the update. Please try again. The connection was interrupted. Check your network and try again.',
  'desktop.update.installNetworkFailed': 'Could not install the update. Please try again later. The connection was interrupted. Check your network and try again.',
  'desktop.update.stopFailed': 'Tasks could not be stopped safely. The update was not installed. Please try again later.',
  'desktop.update.tasksChanged': 'New tasks started. Review the update confirmation again.',
  'desktop.update.tasksUnavailable': 'Состояние задач недоступно. Попробуйте обновить снова, когда рабочее пространство будет готово.',
  title: 'Настройки',
  close: 'Закрыть',
  openDocument: 'Открыть файл конфигурации',
  'openDocument.error': 'Не удалось открыть файл конфигурации',
  'general.nav': 'Общие',
  'general.currentVersion': 'Текущая версия: {version}',
  'developerTools.title': 'Инструменты разработчика',
  'developerTools.error': 'Не удалось сохранить. Попробуйте ещё раз.',
  'developerTools.description': 'Показывать инструменты и информацию для отладки и диагностики',
  'connection.error': 'Нет подключения',
  'connection.connecting': 'Подключение',
  'connection.connected': 'Подключено',
  'connection.reconnect': 'Нет подключения, переподключиться сейчас',
  'connection.restart': 'Подключение, перезапустить сейчас',
  'shortcut.open': 'Открыть настройки',
} satisfies Record<LocaleNamespaceMap['settings'], string>
