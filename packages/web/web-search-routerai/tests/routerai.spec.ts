import { afterEach, describe, expect, it, vi } from 'vitest'
import { WebError } from '@deepseek-ai/dsh-web'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import {
  RouterAiSearchProvider,
  ROUTERAI_PROVIDER_ID,
  mapAnthropicResponse,
  mapUrlCitations,
} from '../src/provider.ts'
import type { RouterAiSearchProviderOptions } from '../src/provider.ts'
import type { ChatCompletionResponse } from '../src/types.ts'

/** Construct the provider over a fixed options value; production passes a live thunk. */
const searchProvider = (options: RouterAiSearchProviderOptions): RouterAiSearchProvider =>
  new RouterAiSearchProvider(() => options)

const baseOptions: RouterAiSearchProviderOptions = {
  currentSelection: () => ({ provider: 'routerai', model: 'deepseek/deepseek-v4-flash-0731' }),
  resolveRoute: () => ({
    provider: 'routerai',
    baseURL: 'https://routerai.test/api/v1',
    apiKeyEnv: credentialRef('ROUTERAI_API_KEY'),
    api: 'openai-completions',
  }),
  resolveApiKey: async () => 'rai-key',
  maxTokens: 4096,
  maxUses: 5,
}

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' }, ...init })
}

/** A chat completion response with url_citation annotations. */
function searchResponse(): ChatCompletionResponse {
  return {
    id: 'rai-1',
    model: 'deepseek/deepseek-v4-flash-0731',
    choices: [{
      index: 0,
      finish_reason: 'stop',
      message: {
        role: 'assistant',
        content: 'Here is a summary of the search results.',
        annotations: [
          {
            type: 'url_citation',
            url_citation: { url: 'https://a.test', title: 'A', content: 'excerpt for A' },
          },
          {
            type: 'url_citation',
            url_citation: { url: 'https://b.test', title: 'B' },
          },
        ],
      },
    }],
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('mapUrlCitations', () => {
  it('maps url_citation annotations to sources with title and snippet', () => {
    const sources = mapUrlCitations([
      { url: 'https://a.test', title: 'A', content: 'excerpt' },
      { url: 'https://b.test', title: 'B' },
    ])
    expect(sources).toEqual([
      { url: 'https://a.test', title: 'A', snippet: 'excerpt' },
      { url: 'https://b.test', title: 'B' },
    ])
  })

  it('dedupes repeated urls, first wins', () => {
    const sources = mapUrlCitations([
      { url: 'https://a.test', title: 'first', content: 'one' },
      { url: 'https://a.test', title: 'second', content: 'two' },
    ])
    expect(sources).toEqual([{ url: 'https://a.test', title: 'first', snippet: 'one' }])
  })

  it('omits absent title and content', () => {
    const sources = mapUrlCitations([{ url: 'https://a.test' }])
    expect(sources).toEqual([{ url: 'https://a.test' }])
  })

  it('skips citations with an empty url', () => {
    const sources = mapUrlCitations([{ url: '' }, { url: 'https://ok.test' }])
    expect(sources).toEqual([{ url: 'https://ok.test' }])
  })
})

describe('RouterAiSearchProvider availability', () => {
  it('is available with a selection, route, and key resolver', () => {
    expect(searchProvider(baseOptions).available()).toBe(true)
  })

  it('is unavailable when request limits are not positive integers', () => {
    expect(searchProvider({ ...baseOptions, maxTokens: 0 }).available()).toBe(false)
    expect(searchProvider({ ...baseOptions, maxUses: 0 }).available()).toBe(false)
  })
})

describe('RouterAiSearchProvider request mapping', () => {
  it('posts a chat/completions request with the web_search_preview tool and bearer key', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(searchResponse()))
    vi.stubGlobal('fetch', fetchMock)
    await searchProvider(baseOptions).search({ query: 'hello' })
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://routerai.test/api/v1/chat/completions')
    expect(init).toMatchObject({ method: 'POST', redirect: 'error' })
    const headers = init.headers as Record<string, string>
    expect(headers['authorization']).toBe('Bearer rai-key')
    expect(headers['content-type']).toBe('application/json')
    const body = JSON.parse(init.body as string) as Record<string, unknown>
    expect(body).toEqual({
      model: 'deepseek/deepseek-v4-flash-0731',
      max_tokens: 4096,
      messages: [{ role: 'user', content: 'Perform a web search for the query: hello' }],
      tools: [{ type: 'web_search_preview', name: 'web_search', max_uses: 5 }],
    })
  })

  it('forwards the abort signal', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(searchResponse()))
    vi.stubGlobal('fetch', fetchMock)
    const controller = new AbortController()
    await searchProvider(baseOptions).search({ query: 'q' }, controller.signal)
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(init.signal).toBe(controller.signal)
  })

  it('maps url_citation annotations to sources and keeps the answer content', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(searchResponse()))
    vi.stubGlobal('fetch', fetchMock)
    const result = await searchProvider(baseOptions).search({ query: 'q' })
    expect(result).toEqual({
      content: 'Here is a summary of the search results.',
      sources: [
        { url: 'https://a.test', title: 'A', snippet: 'excerpt for A' },
        { url: 'https://b.test', title: 'B' },
      ],
      truncated: false,
    })
  })
})

describe('RouterAiSearchProvider route resolution', () => {
  it('throws WEB_PROVIDER_ERROR when there is no current selection', async () => {
    const provider = searchProvider({ ...baseOptions, currentSelection: () => undefined })
    await expect(provider.search({ query: 'q' }))
      .rejects.toThrow(expect.objectContaining({ code: 'WEB_PROVIDER_ERROR' }))
  })

  it('throws WEB_PROVIDER_ERROR when the route is not drivable', async () => {
    const provider = searchProvider({ ...baseOptions, resolveRoute: () => undefined })
    await expect(provider.search({ query: 'q' }))
      .rejects.toThrow(expect.objectContaining({ code: 'WEB_PROVIDER_ERROR' }))
  })

  it('throws WEB_PROVIDER_CREDENTIAL_MISSING when the key is absent', async () => {
    const provider = searchProvider({ ...baseOptions, resolveApiKey: async () => undefined })
    await expect(provider.search({ query: 'q' }))
      .rejects.toThrow(expect.objectContaining({ code: 'WEB_PROVIDER_CREDENTIAL_MISSING' }))
  })
})

describe('RouterAiSearchProvider error handling', () => {
  it('aborts cleanly for a pre-aborted call', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const controller = new AbortController()
    controller.abort(new Error('caller stopped'))
    await expect(searchProvider(baseOptions).search({ query: 'q' }, controller.signal))
      .rejects.toThrow(expect.objectContaining({ code: 'WEB_ABORTED' }))
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('maps a non-OK response to WEB_PROVIDER_ERROR with the API message', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify({ error: { message: 'Model not found' } }),
      { status: 400, headers: { 'content-type': 'application/json' } },
    )))
    await expect(searchProvider(baseOptions).search({ query: 'q' }))
      .rejects.toThrow(expect.objectContaining({ code: 'WEB_PROVIDER_ERROR' }))
    await expect(searchProvider(baseOptions).search({ query: 'q' }))
      .rejects.toThrow(/Model not found/)
  })

  it('throws WEB_PROVIDER_ERROR when the response has no url_citation annotations', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({
      choices: [{ index: 0, message: { role: 'assistant', content: 'no search here' } }],
    })))
    await expect(searchProvider(baseOptions).search({ query: 'q' }))
      .rejects.toThrow(expect.objectContaining({ code: 'WEB_PROVIDER_ERROR' }))
  })

  it('maps a fetch failure to WEB_PROVIDER_ERROR naming the endpoint', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new Error('connection refused')
    }))
    await expect(searchProvider(baseOptions).search({ query: 'q' }))
      .rejects.toThrow(expect.objectContaining({ code: 'WEB_PROVIDER_ERROR' }))
    await expect(searchProvider(baseOptions).search({ query: 'q' }))
      .rejects.toThrow(/routerai\.test/)
  })
})

describe('RouterAiSearchProvider registration', () => {
  it('exposes the stable provider id', () => {
    expect(ROUTERAI_PROVIDER_ID).toBe('routerai')
    expect(searchProvider(baseOptions).id).toBe('routerai')
  })

  it('surfaces WebError instances with stable codes', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new Error('network down')
    }))
    try {
      await searchProvider(baseOptions).search({ query: 'q' })
      throw new Error('expected search to reject')
    } catch (error) {
      expect(error).toBeInstanceOf(WebError)
      expect((error as WebError).code).toBe('WEB_PROVIDER_ERROR')
    }
  })
})

describe('web-search-routerai plugin registration', () => {
  it('registers the provider into ctx.web (HMR-safe)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(searchResponse())))
    const { Context } = await import('@deepseek-ai/cordis')
    const WebRuntime = (await import('@deepseek-ai/dsh-web')).default
    const plugin = await import('../src/index.ts')
    const ctx = new Context()
    await ctx.plugin(WebRuntime, { searchProvider: ROUTERAI_PROVIDER_ID })
    // Mount the settings provider so the plugin's settings section resolves;
    // the provider itself never needs it (all facts come from the thunk),
    // but the real composition mounts one and the plugin must tolerate it.
    const fiber = await ctx.plugin(plugin, {})
    expect(typeof ctx.web.search).toBe('function')
    await fiber.dispose()
    await expect(ctx.web.search({ query: 'q' }))
      .rejects.toThrow(expect.objectContaining({ code: 'WEB_PROVIDER_CONFIGURED_MISSING' }))
  })

  it('has no default export (namespace plugin export shape)', () => {
    const plugin = vi.importActual('../src/index.ts')
    return plugin.then((module) => {
      expect('default' in (module as Record<string, unknown>)).toBe(false)
    })
  })
})

describe('mapAnthropicResponse', () => {
  it('joins result items to citation snippets and maps page_age to publishedAt', () => {
    const result = mapAnthropicResponse({
      content: [
        { type: 'text', text: 'found', citations: [{ type: 'web_search_result_location', url: 'https://a.test', cited_text: 'excerpt for A' }] },
        {
          type: 'web_search_tool_result',
          content: [
            { type: 'web_search_result', url: 'https://a.test', title: 'A', page_age: '2026-02-02' },
            { type: 'web_search_result', url: 'https://b.test', title: 'B' },
          ],
        },
      ],
    })
    expect(result).toEqual({
      sources: [
        { url: 'https://a.test', title: 'A', snippet: 'excerpt for A', publishedAt: '2026-02-02' },
        { url: 'https://b.test', title: 'B' },
      ],
      truncated: false,
    })
  })

  it('throws WEB_PROVIDER_ERROR when no result block is present', () => {
    expect(() => mapAnthropicResponse({ content: [{ type: 'text', text: 'no search' }] }))
      .toThrow(expect.objectContaining({ code: 'WEB_PROVIDER_ERROR' }))
  })
})

describe('RouterAiSearchProvider anthropic-messages protocol', () => {
  const anthropicOptions: RouterAiSearchProviderOptions = {
    ...baseOptions,
    resolveRoute: () => ({
      provider: 'anthropic-gateway',
      baseURL: 'https://anthropic.test/v1',
      apiKeyEnv: credentialRef('ANTHROPIC_API_KEY'),
      api: 'anthropic-messages',
    }),
    resolveApiKey: async () => 'anthropic-key',
  }

  it('posts to /messages with the web_search_20250305 tool and both auth headers', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({
      content: [
        {
          type: 'web_search_tool_result',
          content: [{ type: 'web_search_result', url: 'https://a.test', title: 'A' }],
        },
      ],
    }))
    vi.stubGlobal('fetch', fetchMock)
    await searchProvider(anthropicOptions).search({ query: 'hello' })
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://anthropic.test/v1/messages')
    const headers = init.headers as Record<string, string>
    expect(headers['authorization']).toBe('Bearer anthropic-key')
    expect(headers['x-api-key']).toBe('anthropic-key')
    expect(headers['anthropic-version']).toBe('2023-06-01')
    const body = JSON.parse(init.body as string) as Record<string, unknown>
    expect(body).toEqual({
      model: 'deepseek/deepseek-v4-flash-0731',
      max_tokens: 4096,
      messages: [{ role: 'user', content: [{ type: 'text', text: 'Perform a web search for the query: hello' }] }],
      tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 5 }],
    })
  })

  it('maps web_search_tool_result blocks to sources', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({
      content: [
        {
          type: 'web_search_tool_result',
          content: [{ type: 'web_search_result', url: 'https://a.test', title: 'A', page_age: '2026-02-02' }],
        },
      ],
    })))
    const result = await searchProvider(anthropicOptions).search({ query: 'q' })
    expect(result).toEqual({
      sources: [{ url: 'https://a.test', title: 'A', publishedAt: '2026-02-02' }],
      truncated: false,
    })
  })
})
