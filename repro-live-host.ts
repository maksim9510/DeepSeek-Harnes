/** Simulate the live web host: tsx-style ESM hooks + runtime interception + readPluginMeta. */
import { registerHooks } from 'node:module'

// The live host runs `node --import tsx/esm`, which registers ESM hooks.
registerHooks({
  resolve(specifier, context, next) {
    return next(specifier, context)
  },
})

import {
  createRuntimeResolution,
  readPluginMeta,
  type PatchOptions,
  type Profile,
  type ProfileLayer,
} from './packages/boot/app-boot/src/index.ts'
import { installRuntimeInterception } from './packages/boot/app-boot/src/profile-resolution/resolver.ts'

const ROOT = '/media/DeepSeek/DeepSeek-Harnes'
const HOME = '/home/admin1/.dsh'

const emptyPatches: PatchOptions[] = []
const layers: ProfileLayer[] = [
  { packageName: '@deepseek-ai/dsh-base', packageDir: `${ROOT}/packages/bundle/base`, patchPaths: [], patches: emptyPatches },
  { packageName: '@deepseek-ai/dsh-web-app', packageDir: `${ROOT}/packages/bundle/web-app`, patchPaths: [], patches: emptyPatches },
  { packageName: '@deepseek-ai/dsh-experimental-agent-team-profile', packageDir: `${ROOT}/packages/experimental/agent-team-profile`, patchPaths: [], patches: emptyPatches },
  { packageName: '@deepseek-ai/dsh-experimental-browser-use-profile', packageDir: `${ROOT}/packages/experimental/browser-use-profile`, patchPaths: [], patches: emptyPatches },
]
const profile: Profile = {
  name: 'web',
  dir: `${HOME}/profiles/web`,
  layers,
  patchPath: `${HOME}/profiles/web/cordis.patch.yml`,
  patches: [],
}

const resolution = await createRuntimeResolution({
  installAnchor: `${ROOT}/apps/cli/package.json`,
  profile,
  home: HOME,
})
console.log('entries:', resolution.entries.length)

const interception = installRuntimeInterception(resolution)
try {
  const parentURL = 'file:///home/admin1/.dsh/profiles/web/'
  const meta = readPluginMeta('@deepseek-ai/dsh-persona', parentURL)
  console.log('meta:', JSON.stringify(meta, null, 2))
} finally {
  interception.dispose()
}
