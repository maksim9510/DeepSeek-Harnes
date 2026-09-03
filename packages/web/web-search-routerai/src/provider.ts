/**
 * A search provider that reuses the chat model the current Agent already
 * speaks to. Instead of carrying its own credential and endpoint, it resolves
 * the Agent's active provider/model (via the session request header, falling
 * back to the agent-default-model settings) and calls that provider's own
 * endpoint with a native server-side search tool, mapping the structured
 * results to `WebSearchSource[]`.
 *
 * Two wire protocols are supported, selected by the provider route's `api`:
 * - `openai-completions`: POST `/chat/completions` with the
 *   `web_search_preview` server tool; results surface as `url_citation`
 *   annotations on the assistant message.
 * - `anthropic-messages`: POST `/messages` with the `web_search_20250305`
 *   server tool; results surface as `web_search_tool_result` blocks with
 *   `text`-block citations.
 *
 * The provider deliberately talks to the provider endpoint directly (not via
 * `ctx.llm`): `ctx.llm`'s ToolSchema cannot express a server-side search tool,
 * and the search seam needs the structured citations that pi-ai's stream
 * conversion drops.
 * @module @deepseek-ai/dsh-web-search-routerai/provider
 */

import { WebError } from '@deepseek-ai/dsh-web'
import type {
  WebSearchProvider,
  WebSearchRequest,
  WebSearchResult,
  WebSearchSource,
} from '@deepseek-ai/dsh-web'
import type { CredentialRef } from '@deepseek-ai/dsh-credentials'
import type { ModelSelection } from '@deepseek-ai/dsh-agent'
import type {
  AnthropicResponse,
  ChatCompletionResponse,
  CitationAnnotation,
} from './types.ts'

/** Stable id this provider registers under. */
export const ROUTERAI_PROVIDER_ID = 'routerai'

/** Default upper bound on generated tokens for the search answer. */
export const ROUTERAI_DEFAULT_MAX_TOKENS = 4096

/** Default maximum server-search-tool uses per request. */
export const ROUTERAI_DEFAULT_MAX_USES = 5

/** Wire protocol value for OpenAI-compatible chat completions. */
export const OPENAI_COMPLETIONS_API = 'openai-completions'

/** Wire protocol value for Anthropic-compatible Messages. */
export const ANTHROPIC_MESSAGES_API = 'anthropic-messages'

/** Attribution header sent on every request. Bump with the package version. */
const USER_AGENT = 'deepseek-harness/0.0.1'

/**
 * One resolved provider route: endpoint, credential reference, and wire
 * protocol facts the provider needs to make a search call.
 */
export interface ResolvedRoute {
  /** Registered provider route key (e.g. `routerai`). */
  provider: string
  /** OpenAI- or Anthropic-compatible base URL; the path is appended per protocol. */
  baseURL: string
  /** Credential reference resolving the API key for this route. */
  apiKeyEnv: CredentialRef
  /**
   * Wire protocol of the route. `openai-completions` and `anthropic-messages`
   * are drivable; anything else (or an omitted protocol whose catalog
   * defaults are unknown) is not.
   */
  api?: string
}

/**
 * Reads the "current route" the Agent would use for a chat request. The
 * provider stays decoupled from the concrete settings namespaces (`llm-pi-ai`,
 * `llm-deepseek`) — the plugin layer supplies the thunk.
 */
export interface RouterAiSearchProviderOptions {
  /**
   * Resolve the provider/model the current Agent uses. Called once per search.
   */
  currentSelection: () => ModelSelection | undefined
  /**
   * Resolve endpoint + credential facts for one provider route. Called once
   * per search; returns `undefined` when the route is not drivable.
   */
  resolveRoute: (provider: string) => ResolvedRoute | undefined
  /** Resolve the API key for one credential reference. */
  resolveApiKey: (ref: CredentialRef) => Promise<string | undefined>
  /** Upper bound on generated tokens for the search answer. */
  maxTokens?: number
  /** Maximum server-search-tool uses per request. */
  maxUses?: number
}

/** True for a fetch/`AbortSignal` abort, surfaced as `WEB_ABORTED`. */
function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}

/** True for a positive finite integer. */
function isPositiveInteger(value: number): boolean {
  return Number.isInteger(value) && value > 0
}

/** Throw the provider's stable cancellation error when the caller aborted. */
function throwIfSearchAborted(signal?: AbortSignal): void {
  if (signal?.aborted === true) throw searchAborted(signal)
}

/** Build the provider's stable cancellation error while retaining the reason. */
function searchAborted(signal?: AbortSignal, fallback?: unknown): WebError {
  return new WebError('RouterAI search aborted', 'WEB_ABORTED', {
    cause: signal?.aborted === true ? signal.reason : fallback,
  })
}

/** True when a signal abort fired on a fetch/JSON error path. */
function abortedBySignal(signal: AbortSignal | undefined, error: unknown): boolean {
  return signal?.aborted === true || isAbortError(error)
}

/**
 * Map OpenAI `url_citation` annotations to normalized search sources. Each
 * citation carries the URL, an optional title, and an optional content excerpt
 * (used as the snippet). Dedupes by URL, first occurrence wins.
 *
 * @param citations - the `url_citation` annotations from the assistant message.
 * @returns the normalized, deduped source list.
 */
export function mapUrlCitations(citations: readonly {
  url: string
  title?: string | null
  content?: string | null
}[]): WebSearchSource[] {
  const seen = new Set<string>()
  const sources: WebSearchSource[] = []
  for (const citation of citations) {
    if (citation.url.length === 0 || seen.has(citation.url)) continue
    seen.add(citation.url)
    sources.push({
      url: citation.url,
      ...citation.title != null && citation.title.length > 0 ? { title: citation.title } : {},
      ...citation.content != null && citation.content.length > 0 ? { snippet: citation.content } : {},
    })
  }
  return sources
}

/**
 * Map an Anthropic Messages response to normalized search sources. Walks
 * `web_search_tool_result` blocks for citeable `web_search_result` items and
 * joins each to its citation excerpt from `text` blocks, deduping by URL.
 *
 * @param response - the parsed Messages response body.
 * @returns the normalized, deduped source list.
 * @throws {@link WebError} when no result block is present.
 */
export function mapAnthropicResponse(response: AnthropicResponse): WebSearchResult {
  const blocks = response.content ?? []
  const snippets = new Map<string, string>()
  for (const block of blocks) {
    if (block.type !== 'text') continue
    for (const cite of (block as Extract<typeof block, { type: 'text' }>).citations ?? []) {
      if (cite.url != null && cite.url.length > 0 && cite.cited_text != null && cite.cited_text.length > 0
        && !snippets.has(cite.url)) {
        snippets.set(cite.url, cite.cited_text)
      }
    }
  }
  const seen = new Set<string>()
  const sources: WebSearchSource[] = []
  for (const block of blocks) {
    if (block.type !== 'web_search_tool_result') continue
    for (const item of (block as Extract<typeof block, { type: 'web_search_tool_result' }>).content ?? []) {
      if (item.url.length === 0 || seen.has(item.url)) continue
      seen.add(item.url)
      const snippet = snippets.get(item.url)
      sources.push({
        url: item.url,
        ...item.title != null && item.title.length > 0 ? { title: item.title } : {},
        ...snippet != null && snippet.length > 0 ? { snippet } : {},
        ...item.page_age != null && item.page_age.length > 0 ? { publishedAt: item.page_age } : {},
      })
    }
  }
  if (sources.length === 0) {
    throw new WebError(
      'The provider returned no web_search_tool_result blocks; the request may not have triggered native web search',
      'WEB_PROVIDER_ERROR',
    )
  }
  return { sources, truncated: false }
}

/** Pick the endpoint path for a route's wire protocol. */
function endpointPath(api: string | undefined): string {
  return api === ANTHROPIC_MESSAGES_API ? '/messages' : '/chat/completions'
}

/** Build the request body for a route's wire protocol. */
function buildBody(
  api: string | undefined,
  model: string,
  query: string,
  maxTokens: number,
  maxUses: number,
): unknown {
  if (api === ANTHROPIC_MESSAGES_API) {
    return {
      model,
      max_tokens: maxTokens,
      messages: [{
        role: 'user',
        content: [{ type: 'text', text: `Perform a web search for the query: ${query}` }],
      }],
      tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: maxUses }],
    }
  }
  return {
    model,
    max_tokens: maxTokens,
    messages: [{
      role: 'user',
      content: `Perform a web search for the query: ${query}`,
    }],
    tools: [{ type: 'web_search_preview', name: 'web_search', max_uses: maxUses }],
  }
}

/** Build the request headers for a route's wire protocol. */
function buildHeaders(api: string | undefined, apiKey: string): Record<string, string> {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'accept': 'application/json',
    'authorization': `Bearer ${apiKey}`,
    'user-agent': USER_AGENT,
  }
  if (api === ANTHROPIC_MESSAGES_API) {
    headers['x-api-key'] = apiKey
    headers['anthropic-version'] = '2023-06-01'
  }
  return headers
}

/** True when the wire object carries a `url_citation` annotation with a URL. */
function isUrlCitationAnnotation(value: unknown): value is CitationAnnotation {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  const candidate = value as { type?: unknown; url_citation?: unknown }
  if (candidate.type !== 'url_citation') {
    return false
  }
  const urlCitation = candidate.url_citation
  if (typeof urlCitation !== 'object' || urlCitation === null) {
    return false
  }
  return typeof (urlCitation as { url?: unknown }).url === 'string'
}

/** Parse the provider response into a normalized search result. */
function parseResponse(api: string | undefined, payload: unknown): WebSearchResult {
  if (api === ANTHROPIC_MESSAGES_API) {
    return mapAnthropicResponse(payload as AnthropicResponse)
  }
  const completion = payload as ChatCompletionResponse
  const message = completion.choices?.[0]?.message
  const annotations: unknown[] = message?.annotations ?? []
  const citations = annotations
    .filter(isUrlCitationAnnotation)
    .map(annotation => annotation.url_citation)
  if (citations.length === 0) {
    throw new WebError(
      'The provider returned no url_citation annotations; the web_search_preview tool may not have triggered',
      'WEB_PROVIDER_ERROR',
    )
  }
  return {
    ...message?.content != null && message.content.length > 0 ? { content: message.content } : {},
    sources: mapUrlCitations(citations),
    truncated: false,
  }
}

/**
 * The current-chat-model search provider. Resolves the Agent's active
 * provider/model and drives a native server-side search tool over that
 * provider's own endpoint.
 */
export class RouterAiSearchProvider implements WebSearchProvider {
  readonly id = ROUTERAI_PROVIDER_ID

  /**
   * @param resolveOptions - the options for the NEXT operation, snapshotted
   * once at each operation's entry so one search never mixes two sections. A
   * thunk rather than a value because the plugin's settings section can change
   * between searches, and re-registering the provider to carry a new endpoint
   * would make the seam's selection observable to the user as a flicker.
   */
  constructor(private readonly resolveOptions: () => RouterAiSearchProviderOptions) {}

  available(): boolean {
    const options = this.resolveOptions()
    const selection = options.currentSelection()
    if (selection === undefined) {
      return false
    }
    const route = options.resolveRoute(selection.provider)
    return route !== undefined
      && isPositiveInteger(options.maxTokens ?? ROUTERAI_DEFAULT_MAX_TOKENS)
      && isPositiveInteger(options.maxUses ?? ROUTERAI_DEFAULT_MAX_USES)
  }

  async search(request: WebSearchRequest, signal?: AbortSignal): Promise<WebSearchResult> {
    // One snapshot for the whole operation: a settings write landing inside
    // this await must not mix the old route with the new credential.
    const options = this.resolveOptions()
    const selection = options.currentSelection()
    if (selection === undefined) {
      throw new WebError(
        'Search: no current Agent model selection is available; create a session first',
        'WEB_PROVIDER_ERROR',
      )
    }
    const route = options.resolveRoute(selection.provider)
    if (route === undefined) {
      throw new WebError(
        `Search: provider route "${selection.provider}" is not configured for server-side web search.`
        + ' Configure it under llm-pi-ai with api: openai-completions (web_search_preview)'
        + ' or api: anthropic-messages (web_search_20250305), or point web-search-routerai.baseURL'
        + ' at an OpenAI- or Anthropic-compatible gateway that supports a server-side search tool.',
        'WEB_PROVIDER_ERROR',
      )
    }
    const apiKey = await options.resolveApiKey(route.apiKeyEnv)
    if (apiKey === undefined || apiKey.length === 0) {
      throw new WebError(
        `Search: no API key for provider route "${selection.provider}"; store ${route.apiKeyEnv}`
        + ' through the credentials service (the web Models page writes it) or export it in the launching environment',
        'WEB_PROVIDER_CREDENTIAL_MISSING',
      )
    }
    throwIfSearchAborted(signal)

    const endpoint = `${route.baseURL}${endpointPath(route.api)}`
    const body = buildBody(route.api, selection.model, request.query,
      options.maxTokens ?? ROUTERAI_DEFAULT_MAX_TOKENS,
      options.maxUses ?? ROUTERAI_DEFAULT_MAX_USES)
    const headers = buildHeaders(route.api, apiKey)

    let response: Response
    try {
      response = await fetch(endpoint, {
        method: 'POST',
        redirect: 'error',
        headers,
        body: JSON.stringify(body),
        ...signal !== undefined ? { signal } : {},
      })
    } catch (error: unknown) {
      if (abortedBySignal(signal, error)) throw searchAborted(signal, error)
      throw new WebError(
        `Search request failed: ${String(error)}. The request used endpoint ${JSON.stringify(endpoint)}.`
        + ' Configure the search endpoint in Settings > Plugins > Plugin configuration > Web search,'
        + ' or set DEEPSEEK_SEARCH_BASE_URL / web-search-routerai.baseURL to the chat provider\'s'
        + ' OpenAI- or Anthropic-compatible base.',
        'WEB_PROVIDER_ERROR',
        { cause: error },
      )
    }

    if (!response.ok) {
      const status = response.status
      let message = `Provider API error (HTTP ${status})`
      try {
        const parsed = await response.json() as { error?: { message?: string } | string }
        const detail = typeof parsed.error === 'string' ? parsed.error : parsed.error?.message
        if (detail !== undefined && detail.length > 0) message += `: ${detail}`
      } catch {
        // Non-JSON error body: the HTTP status is already captured.
      }
      throw new WebError(
        `${message}. The request used endpoint ${JSON.stringify(endpoint)}.`
        + ' Configure the search endpoint in Settings > Plugins > Plugin configuration > Web search,'
        + ' or set DEEPSEEK_SEARCH_BASE_URL / web-search-routerai.baseURL.',
        'WEB_PROVIDER_ERROR',
      )
    }

    let payload: unknown
    try {
      payload = await response.json()
    } catch (error: unknown) {
      if (abortedBySignal(signal, error)) throw searchAborted(signal, error)
      throw new WebError(
        `The provider returned an unprocessable response body: ${String(error)}. The request used endpoint ${JSON.stringify(endpoint)}.`,
        'WEB_PROVIDER_ERROR',
        { cause: error },
      )
    }

    try {
      return parseResponse(route.api, payload)
    } catch (error: unknown) {
      if (error instanceof WebError) throw error
      throw new WebError(
        `The provider returned an unprocessable search response: ${String(error)}. The request used endpoint ${JSON.stringify(endpoint)}.`,
        'WEB_PROVIDER_ERROR',
        { cause: error },
      )
    }
  }
}
