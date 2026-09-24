/** Temporary repro: read dsh-persona plugin metadata the same way the Web host does. */
import { readPluginMeta, resolvePluginResource } from './packages/boot/app-boot/src/package-meta.ts'
import { pathToFileURL } from 'node:url'

const parentURL = pathToFileURL('packages/preset/persona/package.json').href
console.log('parentURL:', parentURL)

try {
  console.log('resolve en.json:', resolvePluginResource('@deepseek-ai/dsh-persona/locale/en.json', parentURL))
} catch (error) {
  console.log('en.json resolve threw:', error?.constructor?.name, String(error))
}
try {
  console.log('resolve package.json:', resolvePluginResource('@deepseek-ai/dsh-persona/package.json', parentURL))
} catch (error) {
  console.log('package.json resolve threw:', error?.constructor?.name, String(error))
}
const meta = readPluginMeta('@deepseek-ai/dsh-persona', parentURL)
console.log('meta:', JSON.stringify(meta, null, 2))
