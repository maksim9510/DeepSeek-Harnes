// @vitest-environment jsdom
/** Runtime key guards for the namespaces the compiler cannot check:
 * `permission.access` carries no LocaleNamespaceMap key union (full zh key-set
 * equality against the source export), and `directory-browser` registers its
 * dictionaries inline (every ru key must resolve under the real zh
 * registration of the browse plugin). */
import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { apply as browseApply, inject as browseInject } from '@deepseek-ai/dsh-client-ui-directory-picker-browse/client'
import { accessZh } from '../../../client/ui-permission-presets/src/client/locales.ts'
import { ru as permissionAccess } from '../src/client/locales/permission-access.ts'
import { ru as directoryBrowser } from '../src/client/locales/directory-browser.ts'

describe('runtime key parity', () => {
  it('permission.access: ru keys equal the zh key set', () => {
    expect(Object.keys(permissionAccess).sort()).toEqual(Object.keys(accessZh).sort())
  })

  it('directory-browser: every ru key exists in the real zh registration', async () => {
    const ctx = new Context()
    await ctx.plugin(SlotRegistry).await()
    const svc = new LocaleRuntime(ctx)
    ctx.provide('locale', svc)
    // The browse plugin touches uiWorkspace only lazily (browse flow port),
    // so an empty stub satisfies apply() for the dictionary registration.
    ctx.provide('uiWorkspace', {})
    await ctx.plugin({ inject: [...browseInject], apply: browseApply }).await()
    svc.register('directory-browser', 'ru', directoryBrowser)
    svc.setLocale('zh')
    const t = svc.bind('directory-browser')
    for (const key of Object.keys(directoryBrowser)) {
      expect(t(key), `key ${key} is missing from the zh dictionary`).not.toBe(key)
    }
  })
})
