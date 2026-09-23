/** ru dictionary for the `settings` namespace: shell chrome, the General nav item, and connection copy. */

import type {} from '@deepseek-ai/dsh-client-ui-settings-general/client'
import type { LocaleNamespaceMap } from '@deepseek-ai/dsh-client-ui-slots'

/** Russian dictionary, checked complete against the settings namespace key union. */
export const ru = {
  trigger: 'Настройки',
  'desktop.update.available': 'Update',
  'desktop.update.checking': 'Checking for updates…',
  'desktop.update.progress': '{percent}%…',
  'desktop.update.verifying': 'Verifying update files…',
  'desktop.update.installing': 'Preparing to restart…',
  'desktop.update.ready': 'Install and Restart',
  'desktop.update.retry': 'Retry update',
  'desktop.update.versionDetail': '{label} — V{version}',
  'desktop.update.downloadDetail': 'Downloading update: {percent}%\\nTarget version: V{version}',
  'desktop.update.checkFailed': 'Could not check for updates. Please try again later.',
  'desktop.update.downloadFailed': 'Could not download the update. Please try again.',
  'desktop.update.installFailed': 'Could not install the update. Please try again later.',
  'desktop.update.checkNetworkFailed': 'Could not check for updates. Please try again later. The connection was interrupted. Check your network and try again.',
  'desktop.update.downloadNetworkFailed': 'Could not download the update. Please try again. The connection was interrupted. Check your network and try again.',
  'desktop.update.installNetworkFailed': 'Could not install the update. Please try again later. The connection was interrupted. Check your network and try again.',
  'desktop.update.stopFailed': 'Tasks could not be stopped safely. The update was not installed. Please try again later.',
  'desktop.update.tasksChanged': 'New tasks started. Review the update confirmation again.',
  'desktop.update.tasksUnavailable': 'Task status is unavailable. Try updating again when the workspace is ready.',
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
} satisfies Record<LocaleNamespaceMap['settings'], string>
