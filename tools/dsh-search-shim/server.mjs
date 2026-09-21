/**
 * dsh-search-shim — a tiny local Anthropic-compatible Messages endpoint that
 * implements the `web_search_20250305` server tool for DeepSeek Harness.
 *
 * The harness `web-search-deepseek` provider POSTs one Messages request
 * (baseURL + `/messages`) and expects the response content to contain a
 * `web_search_tool_result` block with `web_search_result` items, plus optional
 * `text` blocks whose `citations[].cited_text` supply per-URL snippets. This
 * shim performs the real web search and answers in exactly that shape.
 *
 * Which retrieval runs is decided per request from the provider the Agent is
 * currently using (see `./provider-route.mjs`): a provider whose gateway runs
 * a native search plugin is asked first, and every route falls back to the
 * keyless engines (DuckDuckGo HTML, Bing, DDG Lite) so no single retrieval
 * path is the only one that can answer.
 *
 * Zero dependencies; run with plain Node (>= 18 for global fetch):
 *   node server.mjs
 * Listens on 127.0.0.1:24881 (override with DSH_SEARCH_SHIM_PORT).
 */

import { createServer } from 'node:http'
import { randomUUID } from 'node:crypto'
import { resolveActiveRoute, searchPlan } from './provider-route.mjs'

const HOST = '127.0.0.1'
const PORT = Number(process.env.DSH_SEARCH_SHIM_PORT ?? 24881)
/** A search request through a gateway runs a model turn; it gets a longer budget than an HTML fetch. */
const PLUGIN_TIMEOUT_MS = 30_000
const USER_AGENT = 'Mozilla/5.0 (X11; Linux x86_64; rv:128.0) Gecko/20100101 Firefox/128.0'
const FETCH_TIMEOUT_MS = 15_000
const MAX_RESULTS = 8
const SNIPPET_MAX_CHARS = 400
const TITLE_MAX_CHARS = 300
const BODY_MAX_BYTES = 1024 * 1024

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
function decodeEntities(text) {
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
function stripTags(text) {
  return decodeEntities(text.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim()
}

/** Truncate one display string, appending an ellipsis marker when cut. */
function clip(text, max) {
  return text.length > max ? `${text.slice(0, max - 1)}\u2026` : text
}

/**
 * Resolve a DuckDuckGo redirect href (`//duckduckgo.com/l/?uddg=<url>`) to the
 * underlying page URL, or pass through an absolute URL as-is.
 */
function resolveHref(href) {
  if (typeof href !== 'string' || href.length === 0) return null
  const absolute = href.startsWith('//') ? `https:${href}` : href
  if (!/^https?:\/\//i.test(absolute)) return null
  try {
    const url = new URL(absolute)
    if (url.hostname.endsWith('duckduckgo.com') && (url.pathname === '/l/' || url.pathname === '/l')) {
      const uddg = url.searchParams.get('uddg')
      return uddg !== null && /^https?:\/\//i.test(uddg) ? uddg : null
    }
    return absolute
  } catch {
    return null
  }
}

/** One search result in the shim's internal shape. */
/** @typedef {{ url: string, title: string, snippet: string }} SearchResult */

/** Fetch one page as text with a hard timeout. */
async function fetchText(url) {
  const response = await fetch(url, {
    headers: { 'user-agent': USER_AGENT, 'accept-language': 'en-US,en;q=0.9' },
    redirect: 'follow',
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  const text = await response.text()
  if (text.length === 0) throw new Error('empty response body')
  return text
}

/**
 * Extract one anchor from an HTML fragment by a class-name fragment. Returns
 * the (entity-decoded) href and tag-stripped inner text, or null. Attribute
 * order is not assumed.
 */
function anchorByClass(fragment, classFragment) {
  const pattern = new RegExp(
    `<a\\b[^>]*class="[^"]*${classFragment}[^"]*"[^>]*>([\\s\\S]*?)</a>`,
    'i',
  )
  const match = fragment.match(pattern)
  if (match === null) return null
  const hrefMatch = match[0].match(/href="([^"]*)"/i)
  return {
    href: hrefMatch !== null ? decodeEntities(hrefMatch[1]) : null,
    text: stripTags(match[1]),
  }
}

/** Remove duplicate URLs (first occurrence wins) from one engine's results. */
function dedupe(results) {
  const seen = new Set()
  const unique = []
  for (const result of results) {
    if (seen.has(result.url)) continue
    seen.add(result.url)
    unique.push(result)
  }
  return unique
}

/** DuckDuckGo's classic HTML endpoint (primary engine). */
async function searchDdgHtml(query) {
  const html = await fetchText(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`)
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
  if (results.length === 0) throw new Error('no results parsed (bot check or layout change)')
  return results
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

/** DuckDuckGo Lite (fallback engine; same redirect-href scheme). */
async function searchDdgLite(query) {
  const html = await fetchText(`https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(query)}`)
  const links = anchorsByClass(html, 'result-link')
  const snippets = []
  for (const match of html.matchAll(/<td[^>]*class="[^"]*result-snippet[^"]*"[^>]*>([\s\S]*?)<\/td>/gi)) {
    snippets.push(stripTags(match[1]))
  }
  const results = []
  for (const [index, anchor] of links.entries()) {
    const url = resolveHref(anchor.href)
    if (url === null) continue
    results.push({
      url,
      title: clip(anchor.text, TITLE_MAX_CHARS),
      snippet: clip(snippets[index] ?? '', SNIPPET_MAX_CHARS),
    })
    if (results.length >= MAX_RESULTS) break
  }
  if (results.length === 0) throw new Error('no results parsed (bot check or layout change)')
  return results
}

/** Bing organic results (fallback engine). */
async function searchBing(query) {
  const html = await fetchText(`https://www.bing.com/search?q=${encodeURIComponent(query)}&count=10`)
  const results = []
  for (const chunk of html.split(/<li class="b_algo"/).slice(1)) {
    const heading = chunk.match(/<h2[^>]*>\s*<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>\s*<\/h2>/i)
    if (heading === null) continue
    const url = decodeEntities(heading[1])
    if (!/^https?:\/\//i.test(url) || url.includes('bing.com/ck/') || url.includes('bing.com/aclick')) continue
    const snippetMatch = chunk.match(/<p\b[^>]*>([\s\S]*?)<\/p>/i)
    results.push({
      url,
      title: clip(stripTags(heading[2]), TITLE_MAX_CHARS),
      snippet: clip(snippetMatch !== null ? stripTags(snippetMatch[1]) : '', SNIPPET_MAX_CHARS),
    })
    if (results.length >= MAX_RESULTS) break
  }
  if (results.length === 0) throw new Error('no results parsed (bot check or layout change)')
  return results
}

/**
 * Call one provider gateway's native search and read the hits out of the
 * `url_citation` annotations on the assistant message. This is the RouterAI
 * `web` plugin contract; a gateway that speaks OpenAI chat completions
 * without it answers with no annotations, which the caller reads as a miss.
 * @param {{ provider: string, model: string | null, baseURL: string, apiKey: string }} route
 * @param {{ engine: string | null }} plan
 * @param {string} query
 * @returns {Promise<SearchResult[]>}
 */
async function searchGatewayPlugin(route, plan, query) {
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
 * Run the credential-free HTML engines in order after any keyed tier missed.
 * @param {string} query
 * @returns {Promise<{ results: SearchResult[], failures: string[] }>}
 */
async function searchKeylessTier(query) {
  const failures = []
  for (const engine of [searchDdgHtml, searchBing, searchDdgLite]) {
    try {
      return { results: await engine(query), failures }
    } catch (error) {
      failures.push(`${engine.name}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  return { results: [], failures }
}

/**
 * Pull the query out of a Messages body. The harness sends
 * "Perform a web search for the query: <q>"; anything else falls back to the
 * joined text so a differently-worded client still gets searched.
 */
function extractQuery(body) {
  const message = Array.isArray(body.messages) ? body.messages[0] : undefined
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
function successEnvelope(body, query, results) {
  const citations = results.filter((result) => result.snippet.length > 0).map((result) => ({
    type: 'citation',
    url: result.url,
    cited_text: result.snippet,
  }))
  return {
    id: `msg_dshshim_${randomUUID().replaceAll('-', '').slice(0, 24)}`,
    type: 'message',
    role: 'assistant',
    model: typeof body.model === 'string' && body.model.length > 0 ? body.model : 'deepseek-v4-flash',
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
function errorEnvelope(message) {
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

function sendJson(response, status, payload) {
  if (response.headersSent) return
  response.writeHead(status, { 'content-type': 'application/json' })
  response.end(JSON.stringify(payload))
}

const server = createServer(async (request, response) => {
  try {
    if (request.method === 'GET' && request.url === '/health') {
      sendJson(response, 200, { ok: true })
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
      const route = resolveActiveRoute()
      const plan = searchPlan(route)
      const failures = []
      if (plan.kind === 'plugin') {
        try {
          const found = dedupe(await searchGatewayPlugin(route, plan, query))
          console.log(`[search-shim] ok via ${plan.label} (engine ${plan.engine ?? 'default'}, model ${route.model}): ${found.length} results for "${query}"`)
          sendJson(response, 200, successEnvelope(body, query, found))
          return
        } catch (error) {
          const detail = error instanceof Error ? error.message : String(error)
          failures.push(`${plan.label}: ${detail}`)
          const reason = plan.reason === null ? '' : ` (${plan.reason})`
          console.log(`[search-shim] ${plan.label} missed${reason}: ${detail}; falling back to the credential-free engines`)
        }
      } else {
        console.log(`[search-shim] ${plan.label}: no keyed search requested — ${plan.reason}`)
      }
      const keyless = await searchKeylessTier(query)
      failures.push(...keyless.failures)
      if (keyless.results.length > 0) {
        const found = dedupe(keyless.results)
        console.log(`[search-shim] ok via keyless engines: ${found.length} results for "${query}"`)
        sendJson(response, 200, successEnvelope(body, query, found))
        return
      }
      console.log(`[search-shim] FAILED for "${query}" on route ${route.provider || 'unresolved'}: ${failures.join(' | ')}`)
      sendJson(response, 502, errorEnvelope(`all search engines failed: ${failures.join('; ')}`))
      return
    }
    sendJson(response, 404, errorEnvelope('not found'))
  } catch (error) {
    sendJson(response, 500, errorEnvelope(error instanceof Error ? error.message : String(error)))
  }
})

server.listen(PORT, HOST, () => {
  console.log(`[search-shim] listening on http://${HOST}:${PORT} (endpoint http://${HOST}:${PORT}/v1/messages)`)
})
process.on('SIGTERM', () => {
  server.close(() => process.exit(0))
  setTimeout(() => process.exit(0), 2000).unref()
})
