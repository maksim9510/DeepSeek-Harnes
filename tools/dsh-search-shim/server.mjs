/**
 * dsh-search-shim — a local Anthropic-compatible Messages endpoint that
 * implements the `web_search_20250305` server tool for DeepSeek Harness.
 *
 * The harness `web-search-deepseek` provider POSTs one Messages request
 * (`baseURL + /messages`) and expects the response content to contain a
 * `web_search_tool_result` block with `web_search_result` items, plus optional
 * `text` blocks whose `citations[].cited_text` supply per-URL snippets. This
 * shim performs the real retrieval and answers in exactly that shape.
 *
 * Retrieval is a two-tier pipeline with no provider allow-list:
 *
 * 1. The route's own gateway. The route resolved from the deployment's settings
 *    (see `./provider-route.mjs`) is asked to run its native web-search plugin.
 *    Whether a gateway serves search is discovered by trying it once per route
 *    fingerprint and remembering the answer, so a gateway that gains or loses
 *    the capability needs no shim change.
 * 2. The credential-free engines. Every engine in `DEFAULT_ENGINES` is a
 *    `{ id, url, parse }` descriptor; the pool orders them by recent success,
 *    quarantines an engine that keeps failing with an exponential cooldown, and
 *    retries an engine whose failure looked like a bot check on the next
 *    request instead of disabling it. Adding an engine is one descriptor.
 *
 * Zero dependencies; run with plain Node (>= 18 for global fetch):
 *   node server.mjs
 * Listens on 127.0.0.1:24881 (override with DSH_SEARCH_SHIM_PORT).
 */

import { createServer } from 'node:http'
import { randomUUID } from 'node:crypto'
import { resolveActiveRoute, searchPlan, routeFingerprint } from './provider-route.mjs'

const HOST = process.env.DSH_SEARCH_SHIM_HOST ?? '127.0.0.1'
const PORT = Number(process.env.DSH_SEARCH_SHIM_PORT ?? 24881)
/** A search request through a gateway runs a model turn; it gets a longer budget than an HTML fetch. */
const PLUGIN_TIMEOUT_MS = Number(process.env.DSH_SEARCH_SHIM_PLUGIN_TIMEOUT_MS ?? 30_000)
const FETCH_TIMEOUT_MS = Number(process.env.DSH_SEARCH_SHIM_FETCH_TIMEOUT_MS ?? 15_000)
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36'
const MAX_RESULTS = Number(process.env.DSH_SEARCH_SHIM_MAX_RESULTS ?? 8)
const SNIPPET_MAX_CHARS = 400
const TITLE_MAX_CHARS = 300
const BODY_MAX_BYTES = 1024 * 1024
/** Cooldown after the second consecutive failure, doubled by each further one. */
const COOLDOWN_BASE_MS = 30_000
const COOLDOWN_MAX_MS = 15 * 60_000
/** Consecutive failures before an engine is skipped for a cooldown. */
const FAILURES_BEFORE_COOLDOWN = 2
/** Exit code for a fatal listen failure, so the unit supervisor stops retrying. */
const EXIT_FATAL_LISTEN = 3

/** Named HTML entities the engines emit in titles and snippets. */
const ENTITIES = Object.freeze({
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#x27;': "'",
  '&#39;': "'",
  '&nbsp;': ' ',
  '&hellip;': '\u2026',
  '&mdash;': '\u2014',
  '&ndash;': '\u2013',
})

/** Decode HTML entities (named set plus decimal/hex numeric) from one fragment. */
export function decodeEntities(text) {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => safeCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => safeCodePoint(Number.parseInt(dec, 10)))
    .replace(/&(amp|lt|gt|quot|nbsp|hellip|mdash|ndash);/g, (m, name) => ENTITIES[`&${name};`] ?? m)
}

/** Map a parsed code point to its character; reject values that would throw. */
function safeCodePoint(code) {
  if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff) return ''
  try {
    return String.fromCodePoint(code)
  } catch {
    return ''
  }
}

/** Strip all tags from a fragment and collapse whitespace. */
export function stripTags(text) {
  return decodeEntities(text.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim()
}

/** Truncate one display string, appending an ellipsis marker when cut. */
function clip(text, max) {
  return text.length > max ? `${text.slice(0, max - 1)}\u2026` : text
}

/**
 * Unwrap one search engine's redirect wrapper to the page it points at.
 *
 * Every engine wraps result links in its own tracker, and the wrapper changes
 * whenever the engine's markup does: DuckDuckGo uses `?uddg=`, Bing serves a
 * `bing.com/ck/a` hop whose target is base64url behind `u=a1`, Google uses
 * `/url?q=`, and Yahoo uses `/RU=<url>/`. Decoding them here, instead of
 * filtering wrapper hosts inside each parser, keeps a wrapper change from
 * silently emptying that engine's result list.
 * @param {URL} url Absolute result URL.
 * @returns {string | null} The underlying page, or null when the wrapper has no
 *   readable target.
 */
function unwrapRedirect(url) {
  const host = url.hostname.replace(/^www\./, '')
  const param = (name) => {
    const value = url.searchParams.get(name)
    return value !== null && /^https?:\/\//i.test(value) ? value : null
  }
  if (host.endsWith('duckduckgo.com') && (url.pathname === '/l/' || url.pathname === '/l')) {
    return param('uddg')
  }
  if (host.endsWith('bing.com')) {
    const encoded = url.searchParams.get('u')
    if (encoded === null) return null
    // Bing prefixes the base64url payload with "a1"; older markup omits it.
    const payload = encoded.startsWith('a1') ? encoded.slice(2) : encoded
    try {
      const decoded = Buffer.from(payload.replaceAll('-', '+').replaceAll('_', '/'), 'base64').toString('utf8')
      return /^https?:\/\//i.test(decoded) ? decoded : null
    } catch {
      return null
    }
  }
  if (host === 'google.com' || host.endsWith('.google.com')) return param('q') ?? param('url')
  if (host.endsWith('yahoo.com')) {
    const match = url.pathname.match(/\/RU=([^/]+)\//)
    if (match === null) return null
    try {
      const decoded = decodeURIComponent(match[1])
      return /^https?:\/\//i.test(decoded) ? decoded : null
    } catch {
      return null
    }
  }
  return null
}

/**
 * Resolve a result href to the page it points at: relative-protocol hrefs,
 * every redirect wrapper this module knows, and absolute URLs pass through.
 * @param {string | null | undefined} href
 * @returns {string | null}
 */
export function resolveHref(href) {
  if (typeof href !== 'string' || href.length === 0) return null
  const absolute = href.startsWith('//') ? `https:${href}` : decodeEntities(href)
  if (!/^https?:\/\//i.test(absolute)) return null
  try {
    return unwrapRedirect(new URL(absolute)) ?? absolute
  } catch {
    return null
  }
}

/** One search result in the shim's internal shape. */
/** @typedef {{ url: string, title: string, snippet: string }} SearchResult */

/** Remove duplicate URLs (first occurrence wins). */
export function dedupe(results) {
  const seen = new Set()
  const unique = []
  for (const result of results) {
    if (seen.has(result.url)) continue
    seen.add(result.url)
    unique.push(result)
  }
  return unique
}

/**
 * Detect an engine that answered with a bot check instead of results. These are
 * transient by nature — the engine blocked one request, not this client — so the
 * pool retries them sooner than a hard failure.
 * @param {number} status HTTP status.
 * @param {string} body Response body.
 * @returns {boolean}
 */
export function isBotCheck(status, body) {
  if (status === 202 || status === 403 || status === 429) return true
  const probe = body.slice(0, 4000).toLowerCase()
  return probe.includes('captcha') || probe.includes('confirm this search was made by a human')
    || probe.includes('challenge-platform') || probe.includes('are you a robot')
}

/** Collect every anchor carrying a class fragment (attribute order is not assumed). */
function anchorsByClass(html, classFragment) {
  const pattern = new RegExp(
    `<a\\b[^>]*class="[^"]*${classFragment}[^"]*"[^>]*>([\\s\\S]*?)</a>`,
    'gi',
  )
  const found = []
  for (const match of html.matchAll(pattern)) {
    const hrefMatch = match[0].match(/href="([^"]*)"/i)
    found.push({
      href: hrefMatch !== null ? decodeEntities(hrefMatch[1]) : null,
      text: stripTags(match[1]),
    })
  }
  return found
}

/** Extract one anchor from an HTML fragment by a class-name fragment. */
function anchorByClass(fragment, classFragment) {
  const found = anchorsByClass(fragment, classFragment)
  return found.length > 0 ? found[0] : null
}

/** Build the result list from anchors and a parallel snippet list. */
function fromAnchors(anchors, snippets) {
  const results = []
  for (const [index, anchor] of anchors.entries()) {
    const url = resolveHref(anchor.href)
    if (url === null) continue
    results.push({
      url,
      title: clip(anchor.text, TITLE_MAX_CHARS),
      snippet: clip(snippets[index] ?? '', SNIPPET_MAX_CHARS),
    })
    if (results.length >= MAX_RESULTS) break
  }
  return results
}

/** Throw the engine-neutral miss error a parser raises when it extracted nothing. */
function engineMiss(engine) {
  return new Error(`${engine}: no results parsed (layout change or bot check)`)
}

/**
 * The credential-free engine descriptors. Each one owns its request — URL and
 * headers, because a mirror that greets one header set with a consent or bot
 * page answers another normally — and the markup knowledge for one engine. The
 * pool owns ordering, cooldown, and fallback, so adding an engine is one entry.
 * @typedef {object} Engine
 * @property {string} id
 * @property {(query: string) => { url: string, headers?: Record<string, string> }} request
 * @property {(html: string) => SearchResult[]} parse
 * @property {(html: string) => string | null} [followUp] An interstitial's
 *   "continue" URL, which the pool follows at most once per attempt.
 * @type {Engine[]}
 */
export const DEFAULT_ENGINES = [
  {
    id: 'bing',
    request: query => ({
      url: `https://www.bing.com/search?q=${encodeURIComponent(query)}&count=10&setlang=en`,
      headers: { 'user-agent': USER_AGENT, 'accept-language': 'en-US,en;q=0.9' },
    }),
    parse(html) {
      const results = []
      for (const chunk of html.split(/<li class="b_algo"/).slice(1)) {
        const heading = chunk.match(/<h2[^>]*>\s*<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>\s*<\/h2>/i)
        if (heading === null) continue
        const url = resolveHref(heading[1])
        if (url === null || url.includes('bing.com/')) continue
        const snippetMatch = chunk.match(/<p\b[^>]*>([\s\S]*?)<\/p>/i)
        results.push({
          url,
          title: clip(stripTags(heading[2]), TITLE_MAX_CHARS),
          snippet: clip(snippetMatch !== null ? stripTags(snippetMatch[1]) : '', SNIPPET_MAX_CHARS),
        })
        if (results.length >= MAX_RESULTS) break
      }
      if (results.length === 0) throw engineMiss('bing')
      return results
    },
  },
  {
    id: 'marginalia',
    request: query => ({
      url: `https://old-search.marginalia.nu/search?query=${encodeURIComponent(query)}`,
      headers: { 'user-agent': USER_AGENT, 'accept-language': 'en-US,en;q=0.9' },
    }),
    followUp(html) {
      // A burst of requests answers with a "wait a moment" page whose link
      // carries the session token that admits the real answer.
      const match = html.match(/href="(\/search\?[^"]*sst=[^"]+)"/)
      return match === null ? null : `https://old-search.marginalia.nu${decodeEntities(match[1])}`
    },
    parse(html) {
      const snippets = []
      for (const match of html.matchAll(/<p[^>]*class="[^"]*description[^"]*"[^>]*>([\s\S]*?)<\/p>/gi)) {
        snippets.push(stripTags(match[1]))
      }
      const results = fromAnchors(anchorsByClass(html, 'title'), snippets)
      if (results.length === 0) throw engineMiss('marginalia')
      return results
    },
  },
  {
    id: 'ddg-html',
    request: query => ({
      url: `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`,
      headers: { 'user-agent': USER_AGENT, 'accept-language': 'en-US,en;q=0.9', accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' },
    }),
    parse(html) {
      const results = []
      for (const block of html.split('class="result results_links').slice(1)) {
        const titleAnchor = anchorByClass(block, 'result__a')
        if (titleAnchor === null) continue
        const url = resolveHref(titleAnchor.href)
        if (url === null) continue
        const snippetAnchor = anchorByClass(block, 'result__snippet')
        results.push({
          url,
          title: clip(titleAnchor.text, TITLE_MAX_CHARS),
          snippet: clip(snippetAnchor?.text ?? '', SNIPPET_MAX_CHARS),
        })
        if (results.length >= MAX_RESULTS) break
      }
      if (results.length === 0) throw engineMiss('ddg-html')
      return results
    },
  },
  {
    id: 'brave',
    request: query => ({
      url: `https://search.brave.com/search?q=${encodeURIComponent(query)}`,
      headers: { 'user-agent': USER_AGENT, 'accept-language': 'en-US,en;q=0.9' },
    }),
    parse(html) {
      const results = []
      for (const block of html.split('class="result-wrapper').slice(1)) {
        const linkMatch = block.match(/<a[^>]+href="(https?:\/\/[^"]+)"/)
        const url = linkMatch === null ? null : resolveHref(decodeEntities(linkMatch[1]))
        if (url === null) continue
        const heading = block.match(/<div class="title[^"]*"[^>]*>([\s\S]*?)<\/div>/)
        const snippetMatch = block.match(/<div class="snippet-description[^"]*"[^>]*>([\s\S]*?)<\/div>/)
        results.push({
          url,
          title: clip(heading !== null ? stripTags(heading[1]) : '', TITLE_MAX_CHARS),
          snippet: clip(snippetMatch !== null ? stripTags(snippetMatch[1]) : '', SNIPPET_MAX_CHARS),
        })
        if (results.length >= MAX_RESULTS) break
      }
      if (results.length === 0) throw engineMiss('brave')
      return results
    },
  },
  {
    id: 'ddg-lite',
    request: query => ({
      url: `https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(query)}`,
      headers: { 'user-agent': USER_AGENT, 'accept-language': 'en-US,en;q=0.9', accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' },
    }),
    parse(html) {
      const snippets = []
      for (const match of html.matchAll(/<td[^>]*class="[^"]*result-snippet[^"]*"[^>]*>([\s\S]*?)<\/td>/gi)) {
        snippets.push(stripTags(match[1]))
      }
      const results = fromAnchors(anchorsByClass(html, 'result-link'), snippets)
      if (results.length === 0) throw engineMiss('ddg-lite')
      return results
    },
  },
]

/**
 * Create the credential-free engine pool. Engines are attempted in the order
 * they were supplied; an engine that keeps failing drops to the back of the
 * queue and is skipped while its cooldown runs, but the pool never gives up on
 * it: once every engine is cooling down they are all attempted again, so an
 * outage of one engine can never leave the shim with nothing to try.
 * @param {{ engines?: Engine[], fetchImpl?: typeof fetch, now?: () => number }} [options]
 * @returns {{ search: (query: string) => Promise<{ results: SearchResult[], failures: string[] }>, state: () => { id: string, failures: number, cooldownUntil: number, lastUsed: number | null, botChecks: number, successes: number }[] }}
 */
export function createEnginePool(options = {}) {
  const engines = options.engines ?? DEFAULT_ENGINES
  const fetchImpl = options.fetchImpl ?? ((...args) => fetch(...args))
  const now = options.now ?? (() => Date.now())
  const health = new Map(engines.map(engine => [engine.id, { failures: 0, botChecks: 0, successes: 0, cooldownUntil: 0, lastUsed: null }]))

  /** One GET with the engine's own headers and a hard timeout. */
  async function get(request, headers) {
    const response = await fetchImpl(request.url, {
      headers: request.headers ?? headers,
      redirect: 'follow',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })
    return { status: response.status, ok: response.ok, body: await response.text() }
  }

  /** Fetch one engine's page, classifying a bot check apart from a hard failure. */
  async function attempt(engine, query) {
    const headers = {
      'user-agent': USER_AGENT,
      accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'accept-language': 'en-US,en;q=0.9',
    }
    let page = await get(engine.request(query), headers)
    let botCheck = isBotCheck(page.status, page.body)
    if (!page.ok || botCheck) {
      const problem = new Error(botCheck ? `bot check (HTTP ${page.status})` : `HTTP ${page.status}`)
      problem.botCheck = botCheck
      throw problem
    }
    // An engine may answer with an interstitial whose own link admits the real
    // answer; following it once per attempt is what keeps a throttled engine
    // usable instead of quarantined.
    const followUp = engine.followUp?.(page.body)
    if (followUp !== null && followUp !== undefined) {
      page = await get({ url: followUp }, headers)
      botCheck = isBotCheck(page.status, page.body)
      if (!page.ok || botCheck) {
        const problem = new Error(botCheck ? `bot check after interstitial (HTTP ${page.status})` : `HTTP ${page.status}`)
        problem.botCheck = botCheck
        throw problem
      }
    }
    return engine.parse(page.body)
  }

  return {
    async search(query) {
      const failures = []
      // An engine that answered recently is the likeliest to answer again, so
      // it moves to the front; the declared order breaks the remaining ties.
      const ordered = [...engines].sort((left, right) => {
        const a = health.get(left.id)
        const b = health.get(right.id)
        return (b?.successes ?? 0) - (a?.successes ?? 0)
      })
      const ready = ordered.filter(engine => (health.get(engine.id)?.cooldownUntil ?? 0) <= now())
      const candidates = ready.length > 0 ? ready : ordered
      for (const engine of candidates) {
        const record = health.get(engine.id)
        record.lastUsed = now()
        try {
          const results = await attempt(engine, query)
          record.failures = 0
          record.botChecks = 0
          record.successes += 1
          return { results, failures }
        } catch (error) {
          const detail = error instanceof Error ? error.message : String(error)
          failures.push(`${engine.id}: ${detail}`)
          record.failures += 1
          if (error?.botCheck === true) record.botChecks += 1
          if (record.failures >= FAILURES_BEFORE_COOLDOWN) {
            const exponent = Math.min(record.failures - FAILURES_BEFORE_COOLDOWN, 8)
            record.cooldownUntil = now() + Math.min(COOLDOWN_BASE_MS * 2 ** exponent, COOLDOWN_MAX_MS)
          }
        }
      }
      return { results: [], failures }
    },
    state() {
      return engines.map(engine => ({ id: engine.id, ...health.get(engine.id) }))
    },
  }
}

/**
 * Read the query out of a Messages body. The harness sends
 * "Perform a web search for the query: <q>"; anything else falls back to the
 * joined text so a differently-worded client still gets searched.
 * @param {unknown} body
 * @returns {string | null}
 */
export function extractQuery(body) {
  const message = Array.isArray(body?.messages) ? body.messages[0] : undefined
  if (message === undefined || !Array.isArray(message.content)) return null
  const text = message.content
    .filter((block) => block !== null && typeof block === 'object' && block.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text)
    .join(' ')
  const match = text.match(/perform a web search for the query:\s*([\s\S]+?)\s*$/i)
  const query = (match !== null ? match[1] : text).trim()
  return query.length > 0 ? query : null
}

/** Build the Anthropic-format success envelope with one result block plus citations. */
export function successEnvelope(body, query, results) {
  const citations = results.filter((result) => result.snippet.length > 0).map((result) => ({
    type: 'citation',
    url: result.url,
    cited_text: result.snippet,
  }))
  return {
    id: `msg_dshshim_${randomUUID().replaceAll('-', '').slice(0, 24)}`,
    type: 'message',
    role: 'assistant',
    model: typeof body?.model === 'string' && body.model.length > 0 ? body.model : 'deepseek-v4-flash',
    content: [
      {
        type: 'web_search_tool_result',
        content: results.map((result) => ({
          type: 'web_search_result',
          url: result.url,
          title: result.title.length > 0 ? result.title : null,
          page_age: null,
        })),
      },
      { type: 'text', text: `Web search results for: ${query}`, ...citations.length > 0 ? { citations } : {} },
    ],
    stop_reason: 'end_turn',
    stop_sequence: null,
    usage: { input_tokens: 0, output_tokens: 0 },
  }
}

/** Anthropic-format error envelope for non-2xx answers. */
export function errorEnvelope(message) {
  return { type: 'error', error: { type: 'api_error', message } }
}

/** Read the request body with a size cap. */
function readBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    request.on('data', (chunk) => {
      size += chunk.length
      if (size > BODY_MAX_BYTES) {
        reject(new Error('request body too large'))
        request.destroy()
        return
      }
      chunks.push(chunk)
    })
    request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    request.on('error', reject)
  })
}

/** Write one JSON response unless the headers already went out. */
function sendJson(response, status, payload) {
  if (response.headersSent) return
  response.writeHead(status, { 'content-type': 'application/json' })
  response.end(JSON.stringify(payload))
}

/**
 * Build the request handler. The gateway is injected so the tier order can be
 * tested without a network: `search` returns the gateway's results, or null
 * when this route's gateway served nothing and the keyless pool should answer.
 * @param {{ pool: ReturnType<typeof createEnginePool>, gateway: { resolve: () => ReturnType<typeof resolveActiveRoute>, plan: (route: ReturnType<typeof resolveActiveRoute>) => ReturnType<typeof searchPlan>, search: (route: ReturnType<typeof resolveActiveRoute>, plan: ReturnType<typeof searchPlan>, query: string) => Promise<SearchResult[] | null> }, log?: (message: string) => void }} options
 * @returns {(request: import('node:http').IncomingMessage, response: import('node:http').ServerResponse) => Promise<void>}
 */
export function createShimHandler(options) {
  const { pool, gateway } = options
  const log = options.log ?? ((message) => console.log(message))
  return async function handle(request, response) {
    try {
      if (request.method === 'GET' && request.url === '/health') {
        sendJson(response, 200, { ok: true })
        return
      }
      if (request.method === 'GET' && request.url === '/engines') {
        sendJson(response, 200, { engines: pool.state() })
        return
      }
      if (request.method === 'POST' && /\/messages$/.test(request.url ?? '')) {
        let body
        try {
          body = JSON.parse(await readBody(request))
        } catch {
          sendJson(response, 400, errorEnvelope('invalid JSON body'))
          return
        }
        const query = extractQuery(body)
        if (query === null) {
          sendJson(response, 400, errorEnvelope('no query found in request messages'))
          return
        }
        const route = gateway.resolve()
        const plan = gateway.plan(route)
        const failures = []
        if (plan.kind === 'plugin') {
          try {
            const found = await gateway.search(route, plan, query)
            if (found !== null && found.length > 0) {
              const results = dedupe(found)
              log(`[search-shim] ok via ${plan.label} (${route.model ?? 'default model'}): ${results.length} results for "${query}"`)
              sendJson(response, 200, successEnvelope(body, query, results))
              return
            }
            failures.push(`${plan.label}: no results`)
            log(`[search-shim] ${plan.label} served nothing; falling back to the credential-free engines`)
          } catch (error) {
            const detail = error instanceof Error ? error.message : String(error)
            failures.push(`${plan.label}: ${detail}`)
            log(`[search-shim] ${plan.label} missed: ${detail}; falling back to the credential-free engines`)
          }
        } else {
          log(`[search-shim] ${plan.label}: no keyed search requested — ${plan.reason ?? 'no route'}`)
        }
        const keyless = await pool.search(query)
        failures.push(...keyless.failures)
        if (keyless.results.length > 0) {
          const results = dedupe(keyless.results)
          log(`[search-shim] ok via credential-free engines: ${results.length} results for "${query}"`)
          sendJson(response, 200, successEnvelope(body, query, results))
          return
        }
        log(`[search-shim] FAILED for "${query}" on route ${route.provider || 'unresolved'}: ${failures.join(' | ')}`)
        sendJson(response, 502, errorEnvelope(`all search engines failed: ${failures.join('; ')}`))
        return
      }
      sendJson(response, 404, errorEnvelope('not found'))
    } catch (error) {
      sendJson(response, 500, errorEnvelope(error instanceof Error ? error.message : String(error)))
    }
  }
}

/**
 * Call one provider gateway's native search and read the hits out of the
 * `url_citation` annotations on the assistant message. This is the OpenAI
 * chat-completions `web` plugin contract; a gateway without it answers with no
 * annotations, which the caller reads as a miss.
 * @param {ReturnType<typeof resolveActiveRoute>} route
 * @param {ReturnType<typeof searchPlan>} plan
 * @param {string} query
 * @returns {Promise<SearchResult[]>}
 */
export async function searchGatewayPlugin(route, plan, query) {
  if (route.baseURL === null || route.apiKey === null) throw new Error('route has no endpoint or credential')
  const response = await fetch(`${route.baseURL}/chat/completions`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${route.apiKey}`,
      'content-type': 'application/json',
      'user-agent': USER_AGENT,
    },
    body: JSON.stringify({
      model: route.model,
      max_tokens: 256,
      plugins: [plan.engine === null
        ? { id: 'web', max_results: MAX_RESULTS }
        : { id: 'web', engine: plan.engine, max_results: MAX_RESULTS }],
      messages: [{ role: 'user', content: query }],
    }),
    redirect: 'error',
    signal: AbortSignal.timeout(PLUGIN_TIMEOUT_MS),
  })
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${clip(await response.text(), 200)}`)
  }
  /** @type {{ choices?: { message?: { annotations?: unknown } }[] }} */
  const payload = await response.json()
  const annotations = payload.choices?.[0]?.message?.annotations
  if (!Array.isArray(annotations)) throw new Error('no annotations in response')
  const results = []
  for (const annotation of annotations) {
    if (annotation?.type !== 'url_citation') continue
    const citation = annotation.url_citation
    if (typeof citation?.url !== 'string' || !/^https?:\/\//i.test(citation.url)) continue
    results.push({
      url: citation.url,
      title: clip(stripTags(typeof citation.title === 'string' ? citation.title : ''), TITLE_MAX_CHARS),
      snippet: clip(stripTags(typeof citation.content === 'string' ? citation.content : ''), SNIPPET_MAX_CHARS),
    })
  }
  if (results.length === 0) throw new Error('no url_citation annotations (search served nothing)')
  return results
}

/**
 * Build the gateway tier: resolve the live route, plan its retrieval, and ask it
 * for search. A route whose gateway answered with no citations is remembered
 * for the process lifetime, because a gateway that does not implement search
 * keeps not implementing it; any other failure is retried on the next request.
 * @param {{ resolve?: () => ReturnType<typeof resolveActiveRoute>, search?: typeof searchGatewayPlugin, now?: () => number }} [options]
 * @returns {{ resolve: () => ReturnType<typeof resolveActiveRoute>, plan: (route: ReturnType<typeof resolveActiveRoute>) => ReturnType<typeof searchPlan>, search: (route: ReturnType<typeof resolveActiveRoute>, plan: ReturnType<typeof searchPlan>, query: string) => Promise<SearchResult[] | null> }}
 */
export function createGateway(options = {}) {
  const resolve = options.resolve ?? (() => resolveActiveRoute())
  const search = options.search ?? searchGatewayPlugin
  /** @type {Map<string, number>} Fingerprint to the time the gateway last served nothing. */
  const unsupported = new Map()
  return {
    resolve,
    plan: route => searchPlan(route),
    async search(route, plan, query) {
      const fingerprint = routeFingerprint(route)
      const servedNothingAt = unsupported.get(fingerprint)
      if (servedNothingAt !== undefined) {
        throw new Error(`gateway answered no citations for this route at ${new Date(servedNothingAt).toISOString()}`)
      }
      try {
        const results = await search(route, plan, query)
        unsupported.delete(fingerprint)
        return results
      } catch (error) {
        if (error instanceof Error && error.message.startsWith('no url_citation annotations')) {
          unsupported.set(fingerprint, Date.now())
        }
        throw error
      }
    },
  }
}

/**
 * Classify a listen failure. A second shim on the same port is not a defect —
 * it is a deployment whose endpoint already answers — so it exits successfully
 * instead of feeding a restart loop.
 * @param {Error & { code?: string }} error
 * @param {() => Promise<boolean>} probeHealth
 * @returns {Promise<'already-running' | 'fatal'>}
 */
export async function classifyListenError(error, probeHealth) {
  if (error?.code === 'EADDRINUSE') {
    try {
      if (await probeHealth()) return 'already-running'
    } catch {
      // An unreachable health endpoint means the port holder is not this shim;
      // that is a deployment conflict worth reporting as fatal.
      return 'fatal'
    }
  }
  return 'fatal'
}

/** Probe this deployment's own health endpoint. */
async function probeHealth() {
  const response = await fetch(`http://${HOST}:${PORT}/health`, { signal: AbortSignal.timeout(3000) })
  return response.ok
}

/** Start the server; exported so the module can be imported by tests without listening. */
export function startServer(options = {}) {
  const pool = options.pool ?? createEnginePool()
  const gateway = options.gateway ?? createGateway()
  const handler = createShimHandler({ pool, gateway })
  const server = createServer((request, response) => { void handler(request, response) })
  server.on('error', (error) => {
    void classifyListenError(error, probeHealth).then((verdict) => {
      if (verdict === 'already-running') {
        console.log(`[search-shim] port ${PORT} already answers as this shim; exiting without restarting`)
        process.exit(0)
      }
      console.error(`[search-shim] cannot listen on ${HOST}:${PORT}: ${error.message}`)
      process.exit(EXIT_FATAL_LISTEN)
    })
  })
  server.listen(PORT, HOST, () => {
    console.log(`[search-shim] listening on http://${HOST}:${PORT} (endpoint http://${HOST}:${PORT}/v1/messages)`)
  })
  return server
}

const isEntryPoint = process.argv[1] !== undefined && import.meta.url === `file://${process.argv[1]}`

if (isEntryPoint) {
  const server = startServer()
  process.on('SIGTERM', () => {
    server.close(() => process.exit(0))
    setTimeout(() => process.exit(0), 2000).unref()
  })
}
