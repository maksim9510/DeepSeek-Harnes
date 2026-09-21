/**
 * Resolve the search route the shim should use for the provider the Agent is
 * currently talking to.
 *
 * The shim is a separate process and cannot ask the Harness, so it reads the
 * same two files the Harness reads: `settings.yaml` for the active provider
 * route and `.credentials.yaml` for the key that route names. Reading on
 * every request is deliberate — switching the model in the GUI changes the
 * search route without restarting the shim.
 *
 * Only the shapes the shim needs are parsed: block mappings whose values are
 * scalars or flow mappings (`{...}`). Sequences, anchors, and block scalars
 * are not interpreted. That covers the provider dictionary this deployment
 * writes while staying independent of the full YAML grammar.
 */

import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

/**
 * Providers whose gateway runs the RouterAI `web` plugin, keyed to the
 * `exa` engine. The gateway's default (`native`) was measured returning no
 * citations for the models this deployment uses.
 */
const PLUGIN_PROVIDERS = new Set(['routerai'])
/** Providers known to expose no server-side search; they start at the keyless tier. */
const KEYLESS_PROVIDERS = new Set(['promee', 'deepseek'])

/** Remove a trailing YAML comment, leaving quoted text intact. */
function stripComment(line) {
  let quote = ''
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]
    if (quote !== '') {
      if (char === quote) quote = ''
      continue
    }
    if (char === '"' || char === "'") { quote = char; continue }
    if (char === '#' && (index === 0 || /\s/.test(line[index - 1]))) return line.slice(0, index)
  }
  return line
}

/**
 * Unquote one scalar. Double-quoted scalars resolve their backslash escapes;
 * single-quoted scalars resolve `''` to one quote. A trailing flow separator is
 * dropped so the continuation lines of a multi-line `{...}` mapping read as
 * plain scalars.
 * @param {string} raw
 * @returns {string}
 */
function scalarValue(raw) {
  const trimmed = raw.trim()
  if (trimmed.length >= 2 && trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1).replace(/\\(["\\/bfnrt])/g, (_, char) => JSON.parse(`"\\${char}"`))
      .replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
  }
  if (trimmed.length >= 2 && trimmed.startsWith("'") && trimmed.endsWith("'")) {
    return trimmed.slice(1, -1).replaceAll("''", "'")
  }
  return trimmed.replace(/,$/, '')
}

/**
 * Index of the first `:` outside quotes and outside a nested flow collection,
 * or -1 when the line declares no key.
 * @param {string} text
 * @returns {number}
 */
function topLevelColon(text) {
  let depth = 0
  let quote = ''
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    if (quote !== '') {
      if (char === quote) quote = ''
      continue
    }
    if (char === '"' || char === "'") quote = char
    else if (char === '{' || char === '[') depth += 1
    else if (char === '}' || char === ']') depth -= 1
    else if (char === ':' && depth === 0) return index
  }
  return -1
}

/**
 * Split a `{...}` body into its top-level entries, respecting nested
 * collections and quotes.
 * @param {string} body
 * @returns {string[]}
 */
function splitFlowEntries(body) {
  const entries = []
  let depth = 0
  let quote = ''
  let start = 0
  for (let index = 0; index < body.length; index += 1) {
    const char = body[index]
    if (quote !== '') {
      if (char === quote) quote = ''
      continue
    }
    if (char === '"' || char === "'") { quote = char; continue }
    if (char === '{' || char === '[') depth += 1
    else if (char === '}' || char === ']') depth -= 1
    else if (char === ',' && depth === 0) {
      entries.push(body.slice(start, index))
      start = index + 1
    }
  }
  const tail = body.slice(start)
  if (tail.trim().length > 0) entries.push(tail)
  return entries
}

/**
 * Parse the block/flow subset of YAML this shim reads.
 * @param {string} text
 * @returns {Record<string, unknown>}
 */
export function parseSimpleYaml(text) {
  const root = {}
  /** @type {{ indent: number, node: Record<string, unknown> }[]} */
  const stack = [{ indent: -1, node: root }]
  for (const rawLine of text.split('\n')) {
    const line = stripComment(rawLine)
    if (line.trim().length === 0) continue
    const indent = line.length - line.trimStart().length
    const content = line.trim()
    const colon = topLevelColon(content)
    if (colon === -1) continue
    const key = scalarValue(content.slice(0, colon))
    const rest = content.slice(colon + 1).trim()
    while (stack.length > 1 && indent <= stack[stack.length - 1].indent) stack.pop()
    const parent = stack[stack.length - 1].node
    if (rest.length === 0) {
      const node = {}
      parent[key] = node
      stack.push({ indent, node })
      continue
    }
    if (rest.startsWith('{')) {
      const value = {}
      for (const entry of splitFlowEntries(rest.slice(1, rest.lastIndexOf('}')))) {
        const split = topLevelColon(entry)
        if (split === -1) continue
        value[scalarValue(entry.slice(0, split))] = scalarValue(entry.slice(split + 1))
      }
      parent[key] = value
      continue
    }
    if (rest.startsWith('[')) {
      parent[key] = []
      continue
    }
    parent[key] = scalarValue(rest)
  }
  return root
}

/** Read one YAML file, or null when it is missing or unreadable. */
function readYaml(path) {
  try {
    return parseSimpleYaml(readFileSync(path, 'utf8'))
  } catch {
    // A missing or unreadable file is the absence of an answer; the caller
    // reports it through the route's problem field instead of failing the search.
    return null
  }
}

/**
 * The settings and credential files the Harness itself reads.
 * @returns {{ settings: string, credentials: string }}
 */
function configPaths() {
  const home = homedir()
  return {
    settings: process.env.DSH_SETTINGS_PATH ?? join(home, '.dsh', 'settings.yaml'),
    credentials: process.env.DSH_CREDENTIALS_PATH ?? join(home, '.dsh', '.credentials.yaml'),
  }
}

/**
 * Resolve the provider, model, endpoint, and credential reference of the route
 * the Agent currently uses. `DSH_SEARCH_SHIM_PROVIDER` overrides the provider
 * so a tier can be exercised without editing settings.
 * @returns {{ provider: string, model: string | null, baseURL: string | null, apiKeyEnv: string | null, apiKey: string | null, forced: boolean, problem: string | null }}
 */
export function resolveActiveRoute() {
  const forced = process.env.DSH_SEARCH_SHIM_PROVIDER ?? ''
  const paths = configPaths()
  const settings = readYaml(paths.settings)
  const selection = settings?.['agent-default-model']
  const selectedProvider = typeof selection?.provider === 'string' ? selection.provider : ''
  const provider = forced.length > 0 ? forced : selectedProvider
  const model = typeof selection?.model === 'string' ? selection.model : null
  if (provider.length === 0) {
    return { provider, model, baseURL: null, apiKeyEnv: null, apiKey: null, forced: forced.length > 0, problem: 'no provider in agent-default-model' }
  }
  const route = settings?.['llm-pi-ai']?.providers?.[provider]
  const baseURL = typeof route?.baseURL === 'string' && route.baseURL.length > 0 ? route.baseURL : null
  const apiKeyEnv = typeof route?.apiKeyEnv === 'string' && route.apiKeyEnv.length > 0 ? route.apiKeyEnv : null
  const credentials = readYaml(paths.credentials)
  const stored = apiKeyEnv === null ? undefined : credentials?.refs?.[apiKeyEnv]
  const apiKey = typeof stored === 'string' && stored.length > 0 ? stored : null
  const problem = apiKey === null
    ? `no credential for ${apiKeyEnv ?? `provider "${provider}"`}`
    : baseURL === null ? `provider "${provider}" declares no baseURL` : null
  return { provider, model, baseURL, apiKeyEnv, apiKey, forced: forced.length > 0, problem }
}

/**
 * Decide which search tier this route starts on. The plugin tier is claimed
 * only for a route that has both an endpoint and a credential; every other
 * route starts credential-free, and the caller falls back either way.
 * @param {ReturnType<typeof resolveActiveRoute>} route
 * @returns {{ kind: 'plugin' | 'keyless', engine: string | null, label: string, reason: string | null }}
 */
export function searchPlan(route) {
  const keyless = (reason) => ({ kind: 'keyless', engine: null, label: `${route.provider || 'unresolved'}-keyless`, reason })
  // A provider with no search plugin is keyless by design, not by missing
  // configuration, so it is classified before the credential problem is read.
  if (KEYLESS_PROVIDERS.has(route.provider)) return keyless('provider exposes no server-side search plugin')
  if (route.problem !== null) return keyless(route.problem)
  const exa = PLUGIN_PROVIDERS.has(route.provider)
  return {
    kind: 'plugin',
    engine: exa ? 'exa' : null,
    label: `${route.provider}-web-plugin`,
    reason: exa ? null : 'unlisted provider; the gated default engine is used',
  }
}
