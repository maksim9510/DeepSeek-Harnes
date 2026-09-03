/**
 * Register a search provider that reuses the chat model the current Agent
 * already speaks to. It resolves the Agent's active provider/model (session
 * request header, falling back to the agent-default-model settings), reads the
 * provider route's endpoint/credential facts from the `llm-pi-ai` settings
 * section, and drives a native server-side search tool over that provider's
 * own endpoint (`web_search_preview` for OpenAI-completions routes,
 * `web_search_20250305` for Anthropic-Messages routes).
 * @module @deepseek-ai/dsh-web-search-routerai
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type {} from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-agent-default-model'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import type { CredentialRef } from '@deepseek-ai/dsh-credentials'
import type {} from '@deepseek-ai/dsh-settings'
import { launchEnvironmentOf } from '@deepseek-ai/dsh-launch-environment'
import type {} from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-web'
import {
  ANTHROPIC_MESSAGES_API,
  OPENAI_COMPLETIONS_API,
  RouterAiSearchProvider,
  ROUTERAI_DEFAULT_MAX_TOKENS,
  ROUTERAI_DEFAULT_MAX_USES,
} from './provider.ts'
import type { ResolvedRoute, RouterAiSearchProviderOptions } from './provider.ts'

export {
  ANTHROPIC_MESSAGES_API,
  OPENAI_COMPLETIONS_API,
  RouterAiSearchProvider,
  ROUTERAI_DEFAULT_MAX_TOKENS,
  ROUTERAI_DEFAULT_MAX_USES,
} from './provider.ts'
export type { ResolvedRoute, RouterAiSearchProviderOptions } from './provider.ts'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'web-search-routerai'

/** The web seam this provider registers into. */
export const inject = ['web']

/** Settings namespace carrying this provider's own overrides. */
export const WEB_SEARCH_ROUTERAI_SETTINGS_NAMESPACE = 'web-search-routerai'

/**
 * The `llm-pi-ai` settings namespace this provider reads provider routes from.
 * Deliberately a string constant rather than an import: this package must not
 * depend on the pi-ai adapter to stay usable when only `llm-deepseek` (or any
 * other provider) is mounted.
 */
const LLM_PI_AI_NAMESPACE = 'llm-pi-ai'

/** Plugin config (all optional — `apply` fills env-var and constant defaults). */
export interface Config {
  /**
   * OpenAI- or Anthropic-compatible base URL used when no provider route
   * declares one. The search provider appends `/chat/completions` (OpenAI) or
   * `/messages` (Anthropic) per the route's protocol.
   */
  baseURL?: string
  /** Credential reference resolved per search; defaults to `DEEPSEEK_API_KEY`. */
  apiKeyEnv?: string
  /** Upper bound on generated tokens for the search answer. Defaults to 4096. */
  maxTokens?: number
  /** Maximum server-search-tool uses per request. Defaults to 5. */
  maxUses?: number
}

export const Config: z<Config> = z.object({
  baseURL: z.string(),
  apiKeyEnv: z.string().role('credential-ref').default('DEEPSEEK_API_KEY'),
  maxTokens: z.number().step(1).min(1).default(ROUTERAI_DEFAULT_MAX_TOKENS),
  maxUses: z.number().step(1).min(1).default(ROUTERAI_DEFAULT_MAX_USES),
})

/** Environment variable naming this provider's fallback endpoint. */
const SEARCH_BASE_URL_ENV = 'DEEPSEEK_SEARCH_BASE_URL'

/**
 * The shape of one `llm-pi-ai.providers[route]` entry the provider reads.
 * Only the fields needed to drive a search are declared; the rest of the
 * profile (models, compat, retry policy) is owned by the pi-ai adapter.
 */
interface PiAiProviderSection {
  api?: string
  baseURL?: string
  apiKeyEnv?: string
}

/**
 * Project one resolved pi-ai settings snapshot into the provider's route
 * facts. A route without a drivable protocol (or without a base URL) is not
 * drivable and resolves to `undefined`.
 * @param section - the `providers` dict from the `llm-pi-ai` settings section.
 * @param provider - the route key.
 * @param fallback - the plugin's own baseURL (settings or env), when configured.
 * @returns the route facts, or `undefined` when the route is not drivable.
 */
function routeFromPiAi(
  section: Record<string, PiAiProviderSection> | undefined,
  provider: string,
  fallback: string | undefined,
): ResolvedRoute | undefined {
  const entry = section?.[provider]
  const api = entry?.api
  // A pi-ai catalog route may omit `api` (the catalog owns the protocol). Only
  // a route we can positively identify as a drivable protocol is accepted; an
  // explicit non-drivable protocol is refused.
  if (api !== undefined && api !== OPENAI_COMPLETIONS_API && api !== ANTHROPIC_MESSAGES_API) {
    return undefined
  }
  const baseURL = entry?.baseURL ?? fallback
  if (baseURL === undefined || baseURL.length === 0) return undefined
  return {
    provider,
    baseURL,
    apiKeyEnv: credentialRef(entry?.apiKeyEnv ?? 'DEEPSEEK_API_KEY'),
    ...api !== undefined ? { api } : {},
  }
}

/**
 * Register the current-chat-model search provider with `ctx.web`.
 * @param ctx - plugin context carrying the web seam.
 * @param config - validated plugin configuration.
 */
export function apply(ctx: Context, config: Config): void {
  let current: () => Config = () => config
  ctx.inject(['settings'], (settingsCtx) => {
    settingsCtx.settings.installSection(ctx, WEB_SEARCH_ROUTERAI_SETTINGS_NAMESPACE, Config, config, {
      setSource: (source) => {
        current = source
      },
      // The registration carries no resolved value: the provider projects the
      // section per search, so a committed change needs no re-registration.
      onChange: () => {},
    })
  })

  const resolveOptions = (): RouterAiSearchProviderOptions => {
    const section = current()
    const fallbackBaseURL = section.baseURL
      ?? launchEnvironmentOf(ctx).get(SEARCH_BASE_URL_ENV)?.value

    // The provider route is whatever the current Agent speaks to. Prefer the
    // live session's request header (the exact route in use); fall back to the
    // agent-default-model settings, which is what new sessions are created with.
    const currentSelection = (): { provider: string; model: string } | undefined => {
      const agent = ctx.get('agents')?.currentInitiator()
      const header = agent?.session.requestHeader()?.config
      if (header?.provider && header.provider.length > 0
        && header.model && header.model.length > 0) {
        return { provider: header.provider, model: header.model }
      }
      const defaultModel = ctx.get('agentDefaultModel')?.currentSelection()
      if (defaultModel !== undefined) {
        return { provider: defaultModel.provider, model: defaultModel.model }
      }
      return undefined
    }

    const resolveRoute = (provider: string): ResolvedRoute | undefined => {
      // Read the llm-pi-ai settings section (best-effort; the settings seam may
      // be absent in a headless composition).
      const settings = ctx.get('settings')
      let piAiSection: Record<string, PiAiProviderSection> | undefined
      if (settings !== undefined) {
        try {
          const descriptor = settings.describe().find(entry => entry.ns === LLM_PI_AI_NAMESPACE)
          const value = descriptor?.value as { providers?: Record<string, PiAiProviderSection> } | undefined
          piAiSection = value?.providers
        } catch {
          piAiSection = undefined
        }
      }
      return routeFromPiAi(piAiSection, provider, fallbackBaseURL)
    }

    const resolveApiKey = async (ref: CredentialRef): Promise<string | undefined> => {
      const credentials = ctx.get('credentials')
      if (credentials !== undefined) {
        return (await credentials.resolve(ref))?.value
      }
      const ambient = launchEnvironmentOf(ctx).get(ref)
      return ambient !== undefined && ambient.value.length > 0 ? ambient.value : undefined
    }

    return {
      currentSelection,
      resolveRoute,
      resolveApiKey,
      maxTokens: section.maxTokens ?? ROUTERAI_DEFAULT_MAX_TOKENS,
      maxUses: section.maxUses ?? ROUTERAI_DEFAULT_MAX_USES,
    }
  }

  ctx.web.registerSearchProvider(new RouterAiSearchProvider(resolveOptions))
}
