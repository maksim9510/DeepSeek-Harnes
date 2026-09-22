/**
 * The experimental browser-tools bundle must carry one parseable layer that
 * mounts the capability service and exactly one provider, because the provider
 * slot is exclusive.
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import * as yaml from 'js-yaml'
import { entryListSchema } from '@deepseek-ai/cordis-plugin-include'

const ROOT = fileURLToPath(new URL('..', import.meta.url))

interface InsertRow {
  id?: string
  name?: string
  config?: Record<string, unknown>
}

function insertedRows(): InsertRow[] {
  const manifest = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8')) as {
    dsh?: { bundle?: { patch?: string } }
  }
  const patch = manifest.dsh!.bundle!.patch!
  const parsed = yaml.load(readFileSync(resolve(ROOT, patch), 'utf8'), { schema: entryListSchema }) as {
    insert?: InsertRow[]
  }[]
  return parsed.flatMap(entry => entry.insert ?? [])
}

describe('browser use profile bundle', () => {
  it('publishes a public manifest whose patch is its runtime content', () => {
    const manifest = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8')) as {
      private?: boolean
      publishConfig?: { access?: string }
      dependencies?: Record<string, string>
      dsh?: { bundle?: { patch?: string } }
    }
    expect(manifest.private).toBeUndefined()
    expect(manifest.publishConfig?.access).toBe('public')
    expect(manifest.dsh?.bundle?.patch).toBe('./cordis.patch.yml')
    expect(manifest.dependencies).toEqual({
      '@deepseek-ai/dsh-browser-use': 'workspace:^',
      '@deepseek-ai/dsh-experimental-browser-use-playwright-mcp': 'workspace:^',
    })
  })

  it('mounts the capability service before exactly one provider', () => {
    const rows = insertedRows()
    expect(rows.map(row => row.id)).toEqual(['browser-use', 'browser-provider', 'browser-use-profile-glue'])
    expect(rows[0]?.name).toBe('@deepseek-ai/dsh-browser-use')
    expect(rows[1]?.name).toBe('@deepseek-ai/dsh-experimental-browser-use-playwright-mcp')
    expect(rows[1]?.config).toEqual({ mode: 'launch', headless: true, toolCallTimeoutMs: 120000 })
  })

  it('registers no second browser provider', () => {
    // `ctx.browserUse.register` accepts one provider; a second registration
    // throws, so the patch must carry exactly one provider package. Every row
    // other than the named capability service and this package's own glue is
    // therefore required to be that single provider, so an unrecognized
    // provider name fails this test instead of passing it.
    const rows = insertedRows()
    const service = rows.filter(row => row.name === '@deepseek-ai/dsh-browser-use')
    expect(service).toHaveLength(1)

    const providers = rows.filter(row => row.name !== '@deepseek-ai/dsh-browser-use'
      && row.name !== '@deepseek-ai/dsh-experimental-browser-use-profile')
    expect(providers.map(row => row.name)).toEqual([
      '@deepseek-ai/dsh-experimental-browser-use-playwright-mcp',
    ])
    expect(providers[0]?.id).toBe('browser-provider')
    expect(providers[0]?.config?.mode).toBe('launch')
  })
})
