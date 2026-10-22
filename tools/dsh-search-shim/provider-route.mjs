/**
 * Resolve the search route the shim should use for the provider the Agent is
 * currently talking to, and classify which retrieval that route can start on.
 *
 * The shim is a separate process and cannot ask the Harness which provider is
 * selected, so it reads the same documents the Harness reads, on every request:
 *
 * - the active profile's `cordis.patch.yml`, where a settings write lands and
 *   which holds `agent-default-model` and the `llm-pi-ai` provider dictionary;
 * - `settings.yaml`, the retired document the Harness renamed to
 *   `settings.yaml.imported`, kept as a fallback for a deployment that predates
 *   the profile patch;
 * - `.credentials.yaml`, which holds `refs.<apiKeyEnv>`.
 *
 * Reading per request is deliberate: switching the model in the GUI changes the
 * search route without restarting the shim.
 *
 * No provider name is special-cased here. A route that declares an endpoint and
 * a credential is offered the gateway's native search; every other route starts
 * on the credential-free engines. Whether a gateway actually serves search is
 * decided by the caller, which remembers the answer per route.
 *
 * The YAML reader covers the subset these documents use: block mappings and
 * sequences, flow collections (single- or multi-line), quoted and plain
 * scalars, and comments. Anchors, tags, and block scalars are not interpreted;
 * a document using them resolves as a missing route instead of failing.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

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
 * Resolve one plain, quoted, or numeric scalar. `~` and `null` read as null,
 * `true`/`false` as booleans, and digit runs as numbers, so a document's
 * non-string fields keep their type. A trailing flow separator is dropped so
 * the continuation lines of a multi-line `{...}` mapping read as scalars.
 * @param {string} raw
 * @returns {unknown}
 */
function scalarValue(raw) {
  const trimmed = raw.trim().replace(/,$/, '').trim()
  if (trimmed.length >= 2 && trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1).replace(/\\(["\\/bfnrt])/g, (_, char) => JSON.parse(`"\\${char}"`))
      .replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
  }
  if (trimmed.length >= 2 && trimmed.startsWith("'") && trimmed.endsWith("'")) {
    return trimmed.slice(1, -1).replaceAll("''", "'")
  }
  if (trimmed === '' || trimmed === '~' || trimmed === 'null') return null
  if (trimmed === 'true') return true
  if (trimmed === 'false') return false
  if (/^-?\d+$/.test(trimmed)) return Number.parseInt(trimmed, 10)
  return trimmed
}

/**
 * Index of the first `:` outside quotes and outside a nested flow collection,
 * or -1 when the text declares no key.
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

/** Count flow brackets opened and not yet closed, ignoring quoted text. */
function flowDepth(text) {
  let depth = 0
  let quote = ''
  for (const char of text) {
    if (quote !== '') {
      if (char === quote) quote = ''
      continue
    }
    if (char === '"' || char === "'") quote = char
    else if (char === '{' || char === '[') depth += 1
    else if (char === '}' || char === ']') depth -= 1
  }
  return depth
}

/** Skip whitespace and separators between two flow entries. */
function skipFlowSpace(text, index) {
  let cursor = index
  while (cursor < text.length && /[\s,]/.test(text[cursor])) cursor += 1
  return cursor
}

/**
 * Read one value from a flow collection: a nested `{...}` or `[...]`, a quoted
 * scalar, or a plain scalar that ends at the caller's stop characters.
 * @param {string} text
 * @param {number} index
 * @param {string} stops Characters ending a plain scalar.
 * @returns {[unknown, number]} The value and the index just past it.
 */
function readFlowValue(text, index, stops) {
  const start = index
  const char = text[start]
  if (char === '{') return readFlowMap(text, start)
  if (char === '[') return readFlowSequence(text, start)
  if (char === '"' || char === "'") {
    let cursor = start + 1
    while (cursor < text.length) {
      if (text[cursor] === '\\' && char === '"') { cursor += 2; continue }
      if (text[cursor] === char) {
        if (char === "'" && text[cursor + 1] === "'") { cursor += 2; continue }
        break
      }
      cursor += 1
    }
    return [scalarValue(text.slice(start, cursor + 1)), cursor + 1]
  }
  let cursor = start
  while (cursor < text.length && !stops.includes(text[cursor])) cursor += 1
  return [scalarValue(text.slice(start, cursor)), cursor]
}

/** Read a `{...}` flow mapping; keys are separated from values by `:`. */
function readFlowMap(text, index) {
  const entries = {}
  let cursor = index + 1
  for (;;) {
    cursor = skipFlowSpace(text, cursor)
    if (cursor >= text.length || text[cursor] === '}') return [entries, cursor + 1]
    const [rawKey, afterKey] = readFlowValue(text, cursor, ':,}')
    cursor = skipFlowSpace(text, afterKey)
    if (text[cursor] !== ':') {
      entries[String(rawKey)] = null
      continue
    }
    const [value, afterValue] = readFlowValue(text, skipFlowSpace(text, cursor + 1), ',}')
    entries[String(rawKey)] = value
    cursor = afterValue
  }
}

/** Read a `[...]` flow sequence. */
function readFlowSequence(text, index) {
  const items = []
  let cursor = index + 1
  for (;;) {
    cursor = skipFlowSpace(text, cursor)
    if (cursor >= text.length || text[cursor] === ']') return [items, cursor + 1]
    const [value, after] = readFlowValue(text, cursor, ',]')
    items.push(value)
    cursor = after
  }
}

/**
 * Join physical lines into logical ones: strip comments, drop blank lines, and
 * append continuation lines to a flow collection left open. YAML allows a flow
 * mapping to span lines, and the legacy settings document writes one that way.
 * @param {string} text
 * @returns {{ indent: number, text: string }[]}
 */
function logicalLines(text) {
  const lines = []
  let pending = null
  for (const rawLine of text.split('\n')) {
    const line = stripComment(rawLine)
    if (line.trim().length === 0) continue
    if (pending !== null) {
      pending.text = `${pending.text} ${line.trim()}`
      if (flowDepth(pending.text) <= 0) { lines.push(pending); pending = null }
      continue
    }
    const entry = { indent: line.length - line.trimStart().length, text: line.trim() }
    if (flowDepth(entry.text) > 0) pending = entry
    else lines.push(entry)
  }
  if (pending !== null) lines.push(pending)
  return lines
}

/**
 * Parse one block node (mapping or sequence) starting at `index`, whose lines
 * share `indent`.
 * @param {{ indent: number, text: string }[]} lines
 * @param {number} index
 * @param {number} indent
 * @returns {[unknown, number]}
 */
function parseBlock(lines, index, indent) {
  const first = lines[index]
  if (first.text.startsWith('{') || first.text.startsWith('[')) return [readFlowValue(first.text, 0, '')[0], index + 1]
  if (first.text === '-' || first.text.startsWith('- ')) return parseSequence(lines, index, indent)
  return parseMapping(lines, index, indent)
}

/** Parse a block mapping whose keys sit at `indent`. */
function parseMapping(lines, index, indent) {
  const entries = {}
  let cursor = index
  while (cursor < lines.length) {
    const line = lines[cursor]
    if (line.indent !== indent) break
    if (line.text === '-' || line.text.startsWith('- ')) break
    const colon = topLevelColon(line.text)
    if (colon === -1) { cursor += 1; continue }
    const key = String(scalarValue(line.text.slice(0, colon)))
    const rest = line.text.slice(colon + 1).trim()
    if (rest.length === 0) {
      const next = lines[cursor + 1]
      if (next !== undefined && next.indent > indent) {
        const [child, after] = parseBlock(lines, cursor + 1, next.indent)
        entries[key] = child
        cursor = after
      } else {
        entries[key] = null
        cursor += 1
      }
      continue
    }
    entries[key] = rest.startsWith('{') || rest.startsWith('[')
      ? readFlowValue(rest, 0, '')[0]
      : scalarValue(rest)
    cursor += 1
  }
  return [entries, cursor]
}

/** Parse a block sequence whose `- ` markers sit at `indent`. */
function parseSequence(lines, index, indent) {
  const items = []
  let cursor = index
  while (cursor < lines.length) {
    const line = lines[cursor]
    if (line.indent !== indent) break
    if (line.text !== '-' && !line.text.startsWith('- ')) break
    const rest = line.text === '-' ? '' : line.text.slice(2).trim()
    if (rest.length === 0) {
      const next = lines[cursor + 1]
      if (next !== undefined && next.indent > indent) {
        const [child, after] = parseBlock(lines, cursor + 1, next.indent)
        items.push(child)
        cursor = after
      } else {
        items.push(null)
        cursor += 1
      }
      continue
    }
    if (topLevelColon(rest) !== -1) {
      // A mapping item: the first key sits on the `- ` line, the rest line up
      // with it two columns in.
      const synthetic = [{ indent: indent + 2, text: rest }, ...lines.slice(cursor + 1)]
      const [child, after] = parseMapping(synthetic, 0, indent + 2)
      items.push(child)
      cursor += 1 + (after - 1)
      continue
    }
    items.push(rest.startsWith('{') || rest.startsWith('[') ? readFlowValue(rest, 0, '')[0] : scalarValue(rest))
    cursor += 1
  }
  return [items, cursor]
}

/**
 * Parse the YAML subset described in this module's header.
 * @param {string} text
 * @returns {unknown} The document value; `[]` and `{}` for empty documents.
 */
export function parseSimpleYaml(text) {
  const lines = logicalLines(text)
  if (lines.length === 0) return null
  if (lines.length === 1 && (lines[0].text.startsWith('{') || lines[0].text.startsWith('['))) {
    return readFlowValue(lines[0].text, 0, '')[0]
  }
  return parseBlock(lines, 0, lines[0].indent)[0]
}

/**
 * The documents the Harness writes and this shim reads.
 * @returns {{ patches: string[], settings: string, credentials: string, home: string }}
 */
export function configPaths() {
  const home = process.env.DSH_HOME ?? join(homedir(), '.dsh')
  const profiles = join(home, 'profiles')
  /** @type {string[]} */
  let patches = []
  try {
    patches = readdirSync(profiles)
      .map(name => join(profiles, name, 'cordis.patch.yml'))
      .flatMap(path => {
        try {
          return [{ path, mtime: statSync(path).mtimeMs }]
        } catch {
          // A profile directory without a patch has nothing to contribute.
          return []
        }
      })
      .sort((left, right) => right.mtime - left.mtime)
      .map(entry => entry.path)
  } catch {
    // No profiles directory is the absence of a profile patch, not a failure:
    // the legacy settings document and the keyless engines still answer.
    patches = []
  }
  return {
    patches,
    settings: join(home, 'settings.yaml'),
    credentials: join(home, '.credentials.yaml'),
    home,
  }
}

/** Read and parse one document, or null when it is missing or unparseable. */
function readDocument(path) {
  try {
    return parseSimpleYaml(readFileSync(path, 'utf8'))
  } catch {
    // A missing or unreadable document is the absence of an answer; the caller
    // reports it through the route's problem field instead of failing a search.
    return null
  }
}

/**
 * Read a document as a list of `{ id, config }` entries. A profile patch is a
 * sequence of loader patch entries; the legacy settings document is keyed by
 * entry id. Both become the same list.
 * @param {unknown} document
 * @returns {{ id: string, config: Record<string, unknown> }[]}
 */
function entriesOf(document) {
  if (Array.isArray(document)) {
    return document.filter(entry => entry !== null && typeof entry === 'object')
      .map(entry => ({
        id: typeof entry.id === 'string' ? entry.id : '',
        config: entry.config !== null && typeof entry.config === 'object' ? entry.config : {},
      }))
      .filter(entry => entry.id.length > 0)
  }
  if (document !== null && typeof document === 'object') {
    return Object.entries(document)
      .filter(([, config]) => config !== null && typeof config === 'object')
      .map(([id, config]) => ({ id, config }))
  }
  return []
}

/** One candidate route document: a parsed patch and the file it came from. */
function routeDocuments(paths) {
  const documents = []
  for (const path of paths.patches) {
    const document = readDocument(path)
    if (document !== null) documents.push({ source: `profile-patch:${path}`, entries: entriesOf(document) })
  }
  const legacy = readDocument(paths.settings)
  if (legacy !== null) documents.push({ source: 'settings.yaml', entries: entriesOf(legacy) })
  return documents
}

/** The first entry with this id, across the documents in priority order. */
function findEntry(documents, id) {
  for (const document of documents) {
    const entry = document.entries.find(candidate => candidate.id === id)
    if (entry !== undefined) return { entry, source: document.source }
  }
  return null
}

/**
 * Resolve the provider, model, endpoint, and credential reference of the route
 * the Agent currently uses. `DSH_SEARCH_SHIM_PROVIDER` overrides the provider so
 * a tier can be exercised without editing settings.
 * @param {{ patches?: string[], settings?: string, credentials?: string }} [options]
 *   Document overrides; defaults to the deployment's own paths.
 * @returns {{ provider: string, model: string | null, baseURL: string | null, apiKeyEnv: string | null, apiKey: string | null, forced: boolean, problem: string | null, source: string }}
 */
export function resolveActiveRoute(options = {}) {
  const defaults = configPaths()
  const paths = {
    patches: options.patches ?? defaults.patches,
    settings: options.settings ?? defaults.settings,
    credentials: options.credentials ?? defaults.credentials,
  }
  const forced = (process.env.DSH_SEARCH_SHIM_PROVIDER ?? '').trim()
  const documents = routeDocuments(paths)
  const selection = findEntry(documents, 'agent-default-model')
  const selectedProvider = typeof selection?.entry.config.provider === 'string' ? selection.entry.config.provider : ''
  const model = typeof selection?.entry.config.model === 'string' ? selection.entry.config.model : null
  const provider = forced.length > 0 ? forced : selectedProvider
  const source = selection?.source ?? 'none'
  if (provider.length === 0) {
    return { provider, model, baseURL: null, apiKeyEnv: null, apiKey: null, forced: forced.length > 0, problem: 'no provider in agent-default-model', source }
  }
  const routeTable = findEntry(documents, 'llm-pi-ai')?.entry.config.providers
  const route = routeTable !== null && typeof routeTable === 'object'
    ? /** @type {Record<string, unknown>} */ (routeTable)[provider]
    : undefined
  const baseURL = typeof route?.baseURL === 'string' && route.baseURL.length > 0 ? route.baseURL : null
  const apiKeyEnv = typeof route?.apiKeyEnv === 'string' && route.apiKeyEnv.length > 0 ? route.apiKeyEnv : null
  const stored = apiKeyEnv === null ? undefined : readDocument(paths.credentials)?.refs?.[apiKeyEnv]
  const apiKey = typeof stored === 'string' && stored.length > 0 ? stored : null
  const problem = apiKey === null
    ? `no credential for ${apiKeyEnv ?? `provider "${provider}"`}`
    : baseURL === null ? `provider "${provider}" declares no baseURL` : null
  return { provider, model, baseURL, apiKeyEnv, apiKey, forced: forced.length > 0, problem, source }
}

/**
 * Decide which retrieval tier this route starts on. A route with both an
 * endpoint and a credential is offered the gateway's native search; every other
 * route starts credential-free, and the caller falls back either way. No
 * provider name is special-cased: a gateway that serves search is discovered by
 * attempting it, not by appearing in a list here.
 * @param {ReturnType<typeof resolveActiveRoute>} route
 * @returns {{ kind: 'plugin' | 'keyless', engine: string | null, label: string, reason: string | null }}
 */
export function searchPlan(route) {
  const engine = (process.env.DSH_SEARCH_SHIM_ENGINE ?? '').trim()
  if (route.problem === null) {
    return { kind: 'plugin', engine: engine.length > 0 ? engine : null, label: `${route.provider}-web-plugin`, reason: null }
  }
  return {
    kind: 'keyless',
    engine: null,
    label: `${route.provider.length > 0 ? route.provider : 'unresolved'}-keyless`,
    reason: route.problem,
  }
}

/**
 * Stable key for one route, used to remember whether its gateway serves search.
 * The model is part of the key because a gateway may serve one model's search
 * and not another's.
 * @param {ReturnType<typeof resolveActiveRoute>} route
 * @returns {string}
 */
export function routeFingerprint(route) {
  return [route.provider, route.model ?? '', route.baseURL ?? ''].join('\u0000')
}
