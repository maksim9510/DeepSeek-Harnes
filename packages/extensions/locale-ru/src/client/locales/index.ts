/** Russian language definition and the per-namespace ru dictionary registry.
 * Dictionary files sit beside this one, one per namespace. */

import { ru as approval } from './approval.ts'
import { ru as chat } from './chat.ts'
import { ru as command } from './command.ts'
import { ru as common } from './common.ts'
import { ru as conversation } from './conversation.ts'
import { ru as cordis } from './cordis.ts'
import { ru as deliverables } from './deliverables.ts'
import { ru as directoryBrowser } from './directory-browser.ts'
import { ru as feedback } from './feedback.ts'
import { ru as goal } from './goal.ts'
import { ru as job } from './job.ts'
import { ru as model } from './model.ts'
import { ru as permissionAccess } from './permission-access.ts'
import { ru as plan } from './plan.ts'
import { ru as question } from './question.ts'
import { ru as reference } from './reference.ts'
import { ru as scheduleCatalog } from './schedule-catalog.ts'
import { ru as sessionLogDownload } from './session-log-download.ts'
import { ru as settingsAgentPreset } from './settings-agent-preset.ts'
import { ru as settingsGeneral } from './settings-general.ts'
import { ru as settingsLocale } from './settings-locale.ts'
import { ru as settingsModels } from './settings-models.ts'
import { ru as settingsPermission } from './settings-permission.ts'
import { ru as settingsPluginInventory } from './settings-plugin-inventory.ts'
import { ru as settingsPlugins } from './settings-plugins.ts'
import { ru as settingsTheme } from './settings-theme.ts'
import { ru as sidebar } from './sidebar.ts'
import { ru as skill } from './skill.ts'
import { ru as slashMenu } from './slash-menu.ts'
import { ru as subagent } from './subagent.ts'
import { ru as trajectory } from './trajectory.ts'
import { ru as workflowRun } from './workflow-run.ts'
import { ru as workspace } from './workspace.ts'

/** The language definition handed to `ctx.locale.addLanguage`. */
export const RU_LANGUAGE = { id: 'ru', label: 'Русский', fallback: 'en' } as const

/** Namespace → ru dictionary; `apply` registers each entry as one owned effect. */
export const RU_DICTIONARIES: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  'common': common,
  'settings.locale': settingsLocale,
  'settings': settingsGeneral,
  'settings.theme': settingsTheme,
  'settings.models': settingsModels,
  'settings.plugins': settingsPlugins,
  'settings.pluginInventory': settingsPluginInventory,
  'settings.agentPreset': settingsAgentPreset,
  'settings.permission': settingsPermission,
  'permission.access': permissionAccess,
  'trajectory': trajectory,
  'conversation': conversation,
  'chat': chat,
  'workspace': workspace,
  'cordis': cordis,
  'subagent': subagent,
  'schedule.catalog': scheduleCatalog,
  'workflowRun': workflowRun,
  'model': model,
  'question': question,
  'job': job,
  'feedback': feedback,
  'goal': goal,
  'reference': reference,
  'slash.menu': slashMenu,
  'command': command,
  'skill': skill,
  'plan': plan,
  'approval': approval,
  'deliverables': deliverables,
  'sidebar': sidebar,
  'session-log-download': sessionLogDownload,
  'directory-browser': directoryBrowser,
}
