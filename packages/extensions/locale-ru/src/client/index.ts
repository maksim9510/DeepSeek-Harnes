/** Russian language pack: the Русский locale definition and per-namespace ru dictionaries. */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import { RU_DICTIONARIES, RU_LANGUAGE } from './locales/index.ts'

/** Required services: the locale registry provided by the locale plugin. */
export const inject = ['locale']

/** Mount the Russian language definition and one ru dictionary per covered namespace. */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.addLanguage(RU_LANGUAGE), 'locale-ru: language')
  for (const [ns, dict] of Object.entries(RU_DICTIONARIES)) {
    ctx.effect(() => ctx.locale.register(ns, 'ru', dict), `locale-ru: ${ns} dictionary`)
  }
}
