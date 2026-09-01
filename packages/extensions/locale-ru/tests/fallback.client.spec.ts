// @vitest-environment jsdom
/** Fallback behavior under ru: the ru → en chain for namespaces the pack does
 * not cover, key-surface display for keys missing everywhere, and resolution
 * when dictionaries register before the language definition. */
import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { RU_LANGUAGE } from '../src/client/locales/index.ts'

describe('ru fallback chain', () => {
  it('walks ru → en for namespaces the pack does not cover', () => {
    const ctx = new Context()
    const svc = new LocaleRuntime(ctx)
    svc.addLanguage(RU_LANGUAGE)
    svc.register('pack-probe', 'en', { onlyEn: 'English only' })
    svc.setLocale('ru')
    expect(svc.bind('pack-probe')('onlyEn')).toBe('English only')
    // A key missing from every dictionary along the chain surfaces the key
    // itself (fail loud) rather than rendering an empty string.
    expect(svc.bind('pack-probe')('missing.key')).toBe('missing.key')
  })

  it('resolves when dictionaries register before the language definition', () => {
    const ctx = new Context()
    const svc = new LocaleRuntime(ctx)
    svc.register('common', 'ru', { cancel: 'Отмена' })
    svc.addLanguage(RU_LANGUAGE)
    svc.setLocale('ru')
    expect(svc.bind('common')('cancel')).toBe('Отмена')
  })
})
