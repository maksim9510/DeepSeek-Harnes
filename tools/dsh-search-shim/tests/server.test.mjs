/**
 * Behaviour tests for the shim's request pipeline: the Anthropic-format envelope
 * the Harness provider reads, query extraction, listen-failure classification,
 * and the engine pool's ordering, cooldown, and fallback. Every test injects its
 * own transport and clock, so nothing here reaches the network or waits on a
 * timer.
 */

import { strict as assert } from 'node:assert'
import { describe, it } from 'node:test'
import { EventEmitter } from 'node:events'
import { readFileSync } from 'node:fs'

import {
  DEFAULT_ENGINES,
  classifyListenError,
  createEnginePool,
  createGateway,
  createShimHandler,
  decodeEntities,
  dedupe,
  errorEnvelope,
  extractQuery,
  isBotCheck,
  resolveHref,
  stripTags,
  successEnvelope,
} from '../server.mjs'

/** One engine that always succeeds, answering with a fixed result list. */
function engine(id, results, options = {}) {
  return {
    id,
    request: query => ({ url: `https://${id}.test/?q=${encodeURIComponent(query)}`, headers: { 'user-agent': 'test' } }),
    parse: () => {
      if (options.throws === true) throw new Error(`${id}: no results parsed`)
      return results
    },
    ...options.followUp === undefined ? {} : { followUp: options.followUp },
  }
}

/** A transport answering each host with the supplied page. */
function transport(pages) {
  const calls = []
  const fetchImpl = async (url) => {
    calls.push(url)
    const host = new URL(url).hostname
    const page = pages[host] ?? pages.default
    if (page instanceof Error) throw page
    return {
      ok: (page.status ?? 200) < 400,
      status: page.status ?? 200,
      text: async () => page.body ?? '',
    }
  }
  return { fetchImpl, calls }
}

/** A request-like event emitter that emits the supplied body then ends. */
function fakeRequest(method, url, body) {
  const request = new EventEmitter()
  request.method = method
  request.url = url
  setImmediate(() => {
    if (body !== undefined) request.emit('data', Buffer.from(typeof body === 'string' ? body : JSON.stringify(body)))
    request.emit('end')
  })
  request.destroy = () => {}
  return request
}

/** A response-like recorder. */
function fakeResponse() {
  return {
    status: 0,
    body: '',
    headersSent: false,
    writeHead(status) { this.status = status; this.headersSent = true },
    end(body) { this.body = body },
  }
}

/** Build a handler over the supplied pool and gateway tiers. */
function handlerWith({ poolResults = [], gatewayResults = null, gatewayThrows = null, planKind = 'plugin' } = {}) {
  const route = {
    provider: 'test-provider', model: 'test-model', baseURL: 'https://gateway.test/v1',
    apiKey: 'secret', apiKeyEnv: 'TEST_KEY', forced: false, problem: null, source: 'test',
  }
  const pool = {
    search: async () => ({ results: poolResults, failures: poolResults.length > 0 ? [] : ['engine: no results'] }),
    state: () => [{ id: 'engine', failures: 0, botChecks: 0, successes: 0, cooldownUntil: 0, lastUsed: null }],
  }
  const gateway = {
    resolve: () => route,
    plan: () => ({ kind: planKind, engine: null, label: `${route.provider}-${planKind}`, reason: planKind === 'keyless' ? 'no credential' : null }),
    search: async () => {
      if (gatewayThrows !== null) throw gatewayThrows
      return gatewayResults
    },
  }
  return createShimHandler({ pool, gateway, log: () => {} })
}

/** Call a handler and return its status and parsed body. */
async function call(handle, method, url, body) {
  const response = fakeResponse()
  await handle(fakeRequest(method, url, body), response)
  return { status: response.status, body: response.body.length > 0 ? JSON.parse(response.body) : null }
}

const MESSAGES_BODY = {
  model: 'test-model',
  messages: [{ role: 'user', content: [{ type: 'text', text: 'Perform a web search for the query: cordis plugins' }] }],
}

describe('resolveHref', () => {
  it('unwraps the DuckDuckGo redirect wrapper', () => {
    assert.equal(
      resolveHref('//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.org%2Fdocs&rut=abc'),
      'https://example.org/docs',
    )
  })

  it('unwraps the Bing base64url wrapper', () => {
    assert.equal(
      resolveHref('https://www.bing.com/ck/a?!&&p=abc&u=a1aHR0cHM6Ly9leGFtcGxlLm9yZy9kb2Nz&ntb=1'),
      'https://example.org/docs',
    )
  })

  it('passes an ordinary absolute URL through', () => {
    assert.equal(resolveHref('https://example.org/page'), 'https://example.org/page')
  })

  it('returns null for an empty or relative href', () => {
    assert.equal(resolveHref(''), null)
    assert.equal(resolveHref('/relative'), null)
    assert.equal(resolveHref(null), null)
  })

  it('passes a wrapper through when its target cannot be read, so the parser can reject it', () => {
    assert.equal(resolveHref('https://www.bing.com/ck/a?u=not-base64!!'), 'https://www.bing.com/ck/a?u=not-base64!!')
  })
})

describe('text helpers', () => {
  it('decodes named, decimal, and hex entities', () => {
    assert.equal(decodeEntities('a&amp;b&#39;c&#x27;d&hellip;'), "a&b'c'd\u2026")
  })

  it('strips tags and collapses whitespace', () => {
    assert.equal(stripTags('<b>one</b>  <i>two</i>'), 'one two')
  })

  it('drops a duplicate URL and keeps the first occurrence', () => {
    assert.deepEqual(
      dedupe([{ url: 'u', title: 'first', snippet: '' }, { url: 'u', title: 'second', snippet: '' }]).map(r => r.title),
      ['first'],
    )
  })
})

describe('isBotCheck', () => {
  it('reads block statuses as a bot check', () => {
    assert.equal(isBotCheck(202, ''), true)
    assert.equal(isBotCheck(403, ''), true)
    assert.equal(isBotCheck(429, ''), true)
  })

  it('reads a challenge body on a 200 as a bot check', () => {
    assert.equal(isBotCheck(200, 'Please complete the following challenge to confirm this search was made by a human'), true)
  })

  it('reads a page of results as no bot check', () => {
    assert.equal(isBotCheck(200, '<li class="b_algo">'), false)
  })
})

describe('extractQuery', () => {
  it('reads the Harness prompt form', () => {
    assert.equal(extractQuery(MESSAGES_BODY), 'cordis plugins')
  })

  it('falls back to the joined text of a differently worded client', () => {
    assert.equal(extractQuery({ messages: [{ content: [{ type: 'text', text: '  raw query  ' }] }] }), 'raw query')
  })

  it('returns null when there is no text block', () => {
    assert.equal(extractQuery({ messages: [] }), null)
    assert.equal(extractQuery({}), null)
  })
})

describe('envelopes', () => {
  it('emits one result block plus citations for snippets', () => {
    const envelope = successEnvelope({ model: 'm' }, 'q', [
      { url: 'https://a.test', title: 'A', snippet: 'snippet a' },
      { url: 'https://b.test', title: '', snippet: '' },
    ])
    const result = envelope.content[0]
    assert.equal(result.type, 'web_search_tool_result')
    assert.equal(result.content.length, 2)
    assert.equal(result.content[1].title, null)
    const text = envelope.content[1]
    assert.equal(text.type, 'text')
    assert.equal(text.citations.length, 1)
    assert.equal(text.citations[0].cited_text, 'snippet a')
    assert.equal(envelope.stop_reason, 'end_turn')
  })

  it('emits the Anthropic error envelope', () => {
    assert.deepEqual(errorEnvelope('boom'), { type: 'error', error: { type: 'api_error', message: 'boom' } })
  })
})

describe('createEnginePool', () => {
  it('answers from the first engine that parses', async () => {
    const { fetchImpl, calls } = transport({ 'first.test': { body: '<html>' }, 'second.test': { body: '<html>' } })
    const pool = createEnginePool({
      engines: [engine('first', [{ url: 'https://a.test', title: 'A', snippet: '' }]), engine('second', [])],
      fetchImpl,
    })
    const result = await pool.search('q')
    assert.equal(result.results.length, 1)
    assert.equal(calls.length, 1)
  })

  it('falls through an engine that a block status answered', async () => {
    const { fetchImpl } = transport({
      'blocked.test': { status: 202, body: 'confirm this search was made by a human' },
      'fine.test': { body: '<html>' },
    })
    const pool = createEnginePool({
      engines: [engine('blocked', []), engine('fine', [{ url: 'https://a.test', title: 'A', snippet: '' }])],
      fetchImpl,
    })
    const result = await pool.search('q')
    assert.equal(result.results.length, 1)
    assert.equal(result.failures.length, 1)
    assert.match(result.failures[0], /bot check/)
  })

  it('follows an interstitial once per attempt', async () => {
    const { fetchImpl, calls } = transport({
      'interstitial.test': { body: '<a href="/search?query=q&sst=token">proceed</a>' },
      'next.test': { body: '<html>' },
    })
    const pool = createEnginePool({
      engines: [{
        id: 'interstitial',
        request: () => ({ url: 'https://interstitial.test/search?query=q' }),
        followUp: html => html.includes('sst=token') ? 'https://next.test/search?query=q&sst=token' : null,
        parse: () => [{ url: 'https://a.test', title: 'A', snippet: '' }],
      }],
      fetchImpl,
    })
    const result = await pool.search('q')
    assert.equal(result.results.length, 1)
    assert.equal(calls.length, 2)
    assert.match(calls[1], /next\.test/)
  })

  it('quarantines an engine after its second consecutive failure and skips it while another answers', async () => {
    let clock = 0
    let steadyHealthy = false
    const { fetchImpl, calls } = transport({
      'flaky.test': { status: 503, body: '' },
      'steady.test': { status: 503, body: '' },
    })
    const pool = createEnginePool({
      engines: [engine('flaky', []), engine('steady', [{ url: 'https://a.test', title: 'A', snippet: '' }])],
      fetchImpl: async (url, init) => {
        if (steadyHealthy && url.includes('steady.test')) {
          calls.push(url)
          return { ok: true, status: 200, text: async () => '<html>' }
        }
        return fetchImpl(url, init)
      },
      now: () => clock,
    })
    // Two rounds with every engine down leave both of them cooling down.
    await pool.search('q1')
    clock += 1000
    await pool.search('q2')
    const cooling = pool.state().find(entry => entry.id === 'flaky')
    assert.equal(cooling.failures, 2)
    assert.ok(cooling.cooldownUntil > clock, 'the engine carries a cooldown')

    // With every engine cooling down they are all attempted again.
    steadyHealthy = true
    clock += 1000
    assert.equal((await pool.search('q3')).results.length, 1)
    const attempts = calls.filter(url => url.includes('flaky.test')).length

    // Now that the healthy engine answers first, the cooling one is skipped.
    clock += 1000
    assert.equal((await pool.search('q4')).results.length, 1)
    assert.equal(calls.filter(url => url.includes('flaky.test')).length, attempts, 'a cooling engine is skipped behind a working one')

    // When the healthy engine fails again after the cooldown, the quarantined
    // one is attempted again instead of being written off.
    steadyHealthy = false
    clock = cooling.cooldownUntil + 96_000
    await pool.search('q5')
    assert.ok(calls.filter(url => url.includes('flaky.test')).length > attempts, 'the engine is attempted again once its cooldown elapsed')
  })

  it('still attempts every engine when all of them are cooling down', async () => {
    let clock = 0
    const { fetchImpl, calls } = transport({ default: { status: 503, body: '' } })
    const pool = createEnginePool({
      engines: [engine('one', []), engine('two', [])],
      fetchImpl,
      now: () => clock,
    })
    await pool.search('q1')
    clock += 10
    await pool.search('q2')
    assert.ok(pool.state().every(entry => entry.cooldownUntil > clock))
    const before = calls.length
    const result = await pool.search('q3')
    assert.equal(calls.length - before, 2, 'both engines are attempted')
    assert.equal(result.results.length, 0)
    assert.equal(result.failures.length, 2)
  })

  it('moves a proven engine ahead of an unproven one', async () => {
    let clock = 0
    const { fetchImpl, calls } = transport({ 'slow.test': { status: 500, body: '' }, 'fast.test': { body: '<html>' } })
    const pool = createEnginePool({
      engines: [engine('slow', []), engine('fast', [{ url: 'https://a.test', title: 'A', snippet: '' }])],
      fetchImpl,
      now: () => clock,
    })
    await pool.search('q1')
    clock += 60_000
    calls.length = 0
    await pool.search('q2')
    assert.equal(new URL(calls[0]).hostname, 'fast.test')
  })

  it('exposes one health record per engine', () => {
    const pool = createEnginePool({ engines: [engine('one', []), engine('two', [])], fetchImpl: async () => ({ ok: true, status: 200, text: async () => '' }) })
    assert.deepEqual(pool.state().map(entry => entry.id), ['one', 'two'])
    assert.deepEqual(Object.keys(pool.state()[0]).sort(), ['botChecks', 'cooldownUntil', 'failures', 'id', 'lastUsed', 'successes'])
  })
})

describe('DEFAULT_ENGINES', () => {
  it('parses a Bing page whose links are base64 redirects', () => {
    const bing = DEFAULT_ENGINES.find(entry => entry.id === 'bing')
    const results = bing.parse(readFixture('bing.html'))
    assert.equal(results.length, 2)
    assert.equal(results[0].url, 'https://github.com/deepseek-ai/deepseek-harness')
    assert.match(results[0].title, /DeepSeek Harness/)
    assert.equal(results[1].url, 'https://example.org/docs')
  })

  it('parses a DuckDuckGo HTML page and unwraps its redirects', () => {
    const ddg = DEFAULT_ENGINES.find(entry => entry.id === 'ddg-html')
    const results = ddg.parse(readFixture('ddg-html.html'))
    assert.deepEqual(results.map(result => result.url), [
      'https://github.com/deepseek-ai/deepseek-harness',
      'https://example.org/docs',
    ])
    assert.match(results[0].snippet, /Cordis/)
  })

  it('parses a Marginalia page and follows its interstitial link', () => {
    const marginalia = DEFAULT_ENGINES.find(entry => entry.id === 'marginalia')
    const results = marginalia.parse(readFixture('marginalia.html'))
    assert.equal(results.length, 1)
    assert.equal(results[0].url, 'https://amplifying.ai/coding-agents/deepseek-harness')
    assert.equal(
      marginalia.followUp(readFixture('marginalia-interstitial.html')),
      'https://old-search.marginalia.nu/search?query=deepseek+harness&sst=S-31a641d29ab94f05',
    )
    assert.equal(marginalia.followUp(readFixture('marginalia.html')), null)
  })

  it('raises on a page with no results instead of answering empty', () => {
    for (const entry of DEFAULT_ENGINES) {
      assert.throws(() => entry.parse('<html><body>nothing here</body></html>'), /no results parsed/)
    }
  })

  it('declares a request per engine and unique ids', () => {
    const ids = DEFAULT_ENGINES.map(entry => entry.id)
    assert.equal(new Set(ids).size, ids.length)
    for (const entry of DEFAULT_ENGINES) assert.match(entry.request('probe').url, /^https:\/\//)
  })
})

describe('createGateway', () => {
  const route = {
    provider: 'gw', model: 'm', baseURL: 'https://gateway.test/v1',
    apiKey: 'k', apiKeyEnv: 'K', forced: false, problem: null, source: 'test',
  }
  const plan = { kind: 'plugin', engine: null, label: 'gw-web-plugin', reason: null }

  it('remembers a gateway that answered with no citations', async () => {
    let calls = 0
    const gateway = createGateway({
      resolve: () => route,
      search: async () => { calls += 1; throw new Error('no url_citation annotations (search served nothing)') },
    })
    await assert.rejects(gateway.search(route, plan, 'q'), /no url_citation annotations/)
    await assert.rejects(gateway.search(route, plan, 'q'), /answered no citations/)
    await assert.rejects(gateway.search(route, plan, 'q'), /answered no citations/)
    assert.equal(calls, 1)
  })

  it('retries a gateway after a transient failure', async () => {
    let calls = 0
    const gateway = createGateway({
      resolve: () => route,
      search: async () => {
        calls += 1
        if (calls === 1) throw new Error('HTTP 503')
        return [{ url: 'https://a.test', title: 'A', snippet: '' }]
      },
    })
    await assert.rejects(gateway.search(route, plan, 'q'), /HTTP 503/)
    assert.equal((await gateway.search(route, plan, 'q')).length, 1)
  })

  it('forgets an answered-capability miss once the gateway serves results', async () => {
    const gateway = createGateway({
      resolve: () => route,
      search: async () => [{ url: 'https://a.test', title: 'A', snippet: '' }],
    })
    assert.equal((await gateway.search(route, plan, 'q')).length, 1)
    assert.equal((await gateway.search(route, plan, 'q')).length, 1)
  })
})

describe('createShimHandler', () => {
  it('answers health', async () => {
    const result = await call(handlerWith(), 'GET', '/health')
    assert.equal(result.status, 200)
    assert.deepEqual(result.body, { ok: true })
  })

  it('answers the engine table', async () => {
    const result = await call(handlerWith(), 'GET', '/engines')
    assert.equal(result.status, 200)
    assert.equal(result.body.engines[0].id, 'engine')
  })

  it('answers a gateway result in the Harness provider format', async () => {
    const handle = handlerWith({ gatewayResults: [{ url: 'https://a.test', title: 'A', snippet: 'cited' }] })
    const result = await call(handle, 'POST', '/v1/messages', MESSAGES_BODY)
    assert.equal(result.status, 200)
    assert.equal(result.body.content[0].type, 'web_search_tool_result')
    assert.equal(result.body.content[0].content[0].url, 'https://a.test')
    assert.equal(result.body.content[1].citations[0].cited_text, 'cited')
  })

  it('falls back to the credential-free tier when the gateway misses', async () => {
    const handle = handlerWith({
      gatewayThrows: new Error('HTTP 503'),
      poolResults: [{ url: 'https://b.test', title: 'B', snippet: '' }],
    })
    const result = await call(handle, 'POST', '/v1/messages', MESSAGES_BODY)
    assert.equal(result.status, 200)
    assert.equal(result.body.content[0].content[0].url, 'https://b.test')
  })

  it('falls back to the credential-free tier when its gateway returns nothing', async () => {
    const handle = handlerWith({
      gatewayResults: null,
      poolResults: [{ url: 'https://b.test', title: 'B', snippet: '' }],
    })
    const result = await call(handle, 'POST', '/v1/messages', MESSAGES_BODY)
    assert.equal(result.status, 200)
    assert.equal(result.body.content[0].content[0].url, 'https://b.test')
  })

  it('skips the gateway tier entirely on a route with no keyed search', async () => {
    const handle = handlerWith({ planKind: 'keyless', poolResults: [{ url: 'https://b.test', title: 'B', snippet: '' }] })
    const result = await call(handle, 'POST', '/v1/messages', MESSAGES_BODY)
    assert.equal(result.status, 200)
  })

  it('reports every tier\'s failure when nothing answers', async () => {
    const handle = handlerWith({ gatewayThrows: new Error('HTTP 503') })
    const result = await call(handle, 'POST', '/v1/messages', MESSAGES_BODY)
    assert.equal(result.status, 502)
    assert.match(result.body.error.message, /all search engines failed/)
    assert.match(result.body.error.message, /test-provider-plugin/)
  })

  it('rejects a malformed body', async () => {
    const result = await call(handlerWith(), 'POST', '/v1/messages', 'not json')
    assert.equal(result.status, 400)
  })

  it('rejects a body with no query', async () => {
    const result = await call(handlerWith(), 'POST', '/v1/messages', { messages: [] })
    assert.equal(result.status, 400)
  })

  it('answers 404 for an unknown path', async () => {
    const result = await call(handlerWith(), 'GET', '/unknown')
    assert.equal(result.status, 404)
  })

  it('answers 400 for an oversized body', async () => {
    const handle = handlerWith()
    const response = fakeResponse()
    const request = new EventEmitter()
    request.method = 'POST'
    request.url = '/v1/messages'
    request.destroy = () => {}
    const pending = handle(request, response)
    request.emit('data', Buffer.alloc(1024 * 1024 + 1))
    request.emit('end')
    await pending
    assert.equal(response.status, 400)
  })
})

describe('classifyListenError', () => {
  it('treats a port that already answers this shim as running', async () => {
    assert.equal(await classifyListenError(Object.assign(new Error('in use'), { code: 'EADDRINUSE' }), async () => true), 'already-running')
  })

  it('treats a port held by something else as fatal', async () => {
    assert.equal(await classifyListenError(Object.assign(new Error('in use'), { code: 'EADDRINUSE' }), async () => false), 'fatal')
    assert.equal(await classifyListenError(Object.assign(new Error('in use'), { code: 'EADDRINUSE' }), async () => { throw new Error('unreachable') }), 'fatal')
  })

  it('treats any other listen failure as fatal', async () => {
    assert.equal(await classifyListenError(Object.assign(new Error('bad host'), { code: 'EADDRNOTAVAIL' }), async () => true), 'fatal')
  })
})

/** Read one HTML fixture next to this test file. */
function readFixture(name) {
  return readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8')
}
