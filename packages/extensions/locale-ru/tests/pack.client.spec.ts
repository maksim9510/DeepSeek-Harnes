// @vitest-environment jsdom
/** Russian language pack wiring: catalog entry, ru-RU browser detection,
 * `<html lang>` tracking, localized copy, and disposal of the language and
 * its dictionaries. */
import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import { apply as settingsApply, inject as settingsInject } from '@deepseek-ai/dsh-client-ui-settings/client'
import { TestRemote, usePinnedBrowserLanguages } from '@deepseek-ai/dsh-client-test-runtime'
import { apply, inject } from '@deepseek-ai/dsh-client-locale/client'
import type { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { LOCALE_SETTINGS_NAMESPACE, LocaleSettingsSchema } from '@deepseek-ai/dsh-client-locale/src/locale-settings.ts'
import { apply as packApply, inject as packInject } from '../src/client/index.ts'

interface SettingsNamespace {
  ns: string
  schema: unknown
  value: Record<string, string>
  applies: 'live'
  secrets: string[]
  revision: number
}

/** Boot the settings + locale plugin stack over a stub Host settings document. */
async function bench() {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  let stored: string | undefined
  let revision = 0
  const namespace = (): SettingsNamespace => ({
    ns: LOCALE_SETTINGS_NAMESPACE,
    schema: LocaleSettingsSchema.toJSON(),
    value: stored === undefined ? {} : { preference: stored },
    applies: 'live',
    secrets: [],
    revision,
  })
  const describeRpc = async () => ({
    ok: true as const,
    value: { writable: true, hasDocument: true, namespaces: [namespace()] },
  })
  const mutate = async (_ns: string, ops: { value: string }[]) => {
    stored = ops[0]!.value
    revision += 1
    return { ok: true as const, value: namespace() }
  }
  new TestRemote(ctx, { settings: { describe: describeRpc, mutate } })
  await ctx.plugin({ inject: [...settingsInject], apply: settingsApply }).await()
  await ctx.plugin({ inject: [...inject], apply }).await()
  return { ctx, locale: ctx.get('locale') as LocaleRuntime }
}

/** Boot the pack as its own fiber so disposal is observable. */
const packOf = (ctx: Context) => ctx.plugin({ inject: [...packInject], apply: packApply })

usePinnedBrowserLanguages('ru-RU')

describe('Russian language pack', () => {
  it('adds Русский after the two built-ins and opens on it from a ru-RU browser', async () => {
    const b = await bench()
    await packOf(b.ctx).await()
    expect(b.locale.getLocale().locales).toEqual([
      { id: 'zh', label: '中文', fallback: 'en' },
      { id: 'en', label: 'English' },
      { id: 'ru', label: 'Русский', fallback: 'en' },
    ])
    expect(b.locale.getLocale().active).toBe('ru')
    expect(document.documentElement.lang).toBe('ru')
  })

  it('serves Russian copy from the packed common dictionary', async () => {
    const b = await bench()
    await packOf(b.ctx).await()
    expect(b.locale.bind('common')('cancel')).toBe('Отмена')
    expect(b.locale.bind('common')('markdown.truncatedCharacters')).toBe('… усечено, всего {total} символов')
  })

  it('disposal removes the language and dictionaries; the active locale falls back', async () => {
    const b = await bench()
    const fiber = packOf(b.ctx)
    await fiber.await()
    await fiber.dispose()
    expect(b.locale.getLocale().locales.map(option => option.id)).toEqual(['zh', 'en'])
    expect(b.locale.getLocale().active).toBe('en')
    expect(b.locale.bind('common')('cancel')).toBe('Cancel')
  })
})
