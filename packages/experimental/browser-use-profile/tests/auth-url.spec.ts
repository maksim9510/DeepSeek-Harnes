/**
 * Independent verification of the browser-use profile's runtime glue.
 *
 * The glue's only job is the authentication fact a browser tool needs: publish
 * the Web GUI URL carrying this process's launch token, through the real
 * `ctx.shellEnv` registry, resolved per execution and never cached. These
 * cases exercise the real exported `apply()` against the real
 * `ShellEnvRegistry`, so the registry's own key validation runs.
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-connection'
import type {} from '@deepseek-ai/dsh-host-webserver'
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import { ShellEnvRegistry } from '@deepseek-ai/dsh-shell-env'
import type { ToolExecution } from '@deepseek-ai/dsh-tools'
import { apply, name } from '../src/index.ts'

const AUTH_URL_KEY = 'DSH_WEB_AUTH_URL'
const PORT = 3199

/** Minimal execution: only the fields the registry reads are populated. */
function execution(): ToolExecution {
  return {
    signal: new AbortController().signal,
    token: Symbol('auth-url-test') as ToolExecution['token'],
    callId: ToolCallId('auth-url-call'),
    rootCallId: ToolCallId('auth-url-call'),
    name: 'bash',
    arguments: { command: 'true' },
  }
}

interface FakeConnection {
  authenticatedUrl: (baseUrl: string) => string
}

/**
 * Load the real glue plugin over a real registry and return both.
 * @param provide - services to publish before the plugin's resolvers run.
 * @returns the live context and the registry under test.
 */
async function loaded(provide: { port?: number; connection?: FakeConnection } = {}) {
  const ctx = new Context()
  const registry = new ShellEnvRegistry(ctx, { dshHome: './auth-url-test-home' })
  if (provide.port !== undefined) ctx.provide('webServer', { port: provide.port } as never)
  if (provide.connection !== undefined) ctx.provide('connection', provide.connection as never)
  await ctx.plugin({ inject: ['shellEnv'], apply })
  return { ctx, registry }
}

afterEach(() => vi.restoreAllMocks())

describe('browser-use profile auth glue', () => {
  it('declares the plugin under its stable name', () => {
    expect(name).toBe('experimental-browser-use-profile')
  })

  it('registers exactly one contributor owning DSH_WEB_AUTH_URL with a non-empty description', async () => {
    const { registry } = await loaded()

    const declared = registry.list()
    expect(declared.map(entry => entry.key)).toEqual([AUTH_URL_KEY])
    expect(declared[0]?.contributor).toBe('browser-use-profile')
    expect(declared[0]?.description.trim().length).toBeGreaterThan(0)

    // The declaration itself survived the registry's key validation, and the key
    // is really owned: a second contributor on the same registry cannot claim it.
    expect(() => registry.register({
      name: 'other-owner',
      variables: { [AUTH_URL_KEY]: { description: 'Competing owner.' } },
      resolve: () => ({}),
    })).toThrow(/DSH_WEB_AUTH_URL/u)
  })

  it('resolves a token-bearing loopback URL when webServer and connection exist', async () => {
    const { registry } = await loaded({
      port: PORT,
      connection: { authenticatedUrl: base => `${base}?token=live-process-token` },
    })

    const value = registry.collect(execution())[AUTH_URL_KEY]
    expect(value).toBe(`http://127.0.0.1:${String(PORT)}?token=live-process-token`)

    const url = new URL(value!)
    expect(url.hostname).toBe('127.0.0.1')
    expect(url.port).toBe(String(PORT))
    const token = url.searchParams.get('token')
    expect(token).not.toBeNull()
    expect(token!.length).toBeGreaterThan(0)
  })

  it('passes the clean loopback origin to the connection, not a pre-built token URL', async () => {
    const authenticatedUrl = vi.fn((base: string) => `${base}?token=t`)
    const { registry } = await loaded({ port: PORT, connection: { authenticatedUrl } })

    registry.collect(execution())
    expect(authenticatedUrl.mock.calls).toEqual([[`http://127.0.0.1:${String(PORT)}`]])
  })

  it('publishes nothing and does not throw when webServer is absent', async () => {
    const { registry } = await loaded({
      connection: { authenticatedUrl: base => `${base}?token=never-used` },
    })

    let collected: Readonly<Record<string, string>> | undefined
    expect(() => { collected = registry.collect(execution()) }).not.toThrow()
    expect(collected).not.toHaveProperty(AUTH_URL_KEY)
  })

  it('publishes nothing and does not throw when connection is absent', async () => {
    const { registry } = await loaded({ port: PORT })

    let collected: Readonly<Record<string, string>> | undefined
    expect(() => { collected = registry.collect(execution()) }).not.toThrow()
    // Publishing the clean origin here would break the variable's own promise:
    // a browser opening it receives the root 401 the prompt section warns about.
    expect(collected).not.toHaveProperty(AUTH_URL_KEY)
  })

  it('does not throw when neither webServer nor connection is provided', async () => {
    const { registry } = await loaded()

    let collected: Readonly<Record<string, string>> | undefined
    expect(() => { collected = registry.collect(execution()) }).not.toThrow()
    expect(collected).not.toHaveProperty(AUTH_URL_KEY)
  })

  it('does not throw while the shellEnv service is absent', () => {
    const ctx = new Context()
    expect(() => ctx.plugin({ inject: ['shellEnv'], apply })).not.toThrow()
  })

  it('registers once shellEnv mounts later, matching the bundle layer order', async () => {
    const ctx = new Context()
    ctx.provide('webServer', { port: 4200 } as never)
    ctx.provide('connection', { authenticatedUrl: (base: string) => `${base}?token=t` } as never)
    const fiber = await ctx.plugin({ inject: ['shellEnv'], apply })
    expect(ctx.shellEnv).toBeUndefined()

    const registry = new ShellEnvRegistry(ctx, { dshHome: './auth-url-test-home' })
    await new Promise(resolve => setTimeout(resolve, 0))

    expect(registry.list().map(entry => entry.key)).toEqual([AUTH_URL_KEY])
    expect(registry.collect(execution())[AUTH_URL_KEY]).toBe('http://127.0.0.1:4200?token=t')
    await fiber.dispose()
  })

  it('resolves the URL freshly on every execution instead of caching it', async () => {
    let launchToken = 'token-one'
    const authenticatedUrl = vi.fn((base: string) => `${base}?token=${launchToken}`)
    const { registry } = await loaded({ port: PORT, connection: { authenticatedUrl } })

    const first = registry.collect(execution())[AUTH_URL_KEY]
    launchToken = 'token-two'
    const second = registry.collect(execution())[AUTH_URL_KEY]

    expect(first).toBe(`http://127.0.0.1:${String(PORT)}?token=token-one`)
    expect(second).toBe(`http://127.0.0.1:${String(PORT)}?token=token-two`)
    expect(first).not.toBe(second)
    expect(authenticatedUrl).toHaveBeenCalledTimes(2)
  })

  it('follows the live port when the Web server reports a new one', async () => {
    const ctx = new Context()
    const registry = new ShellEnvRegistry(ctx, { dshHome: './auth-url-test-home' })
    const server = { port: 4100 }
    ctx.provide('webServer', server as never)
    ctx.provide('connection', { authenticatedUrl: (base: string) => `${base}?token=t` } as never)
    await ctx.plugin({ inject: ['shellEnv'], apply })

    expect(registry.collect(execution())[AUTH_URL_KEY]).toBe('http://127.0.0.1:4100?token=t')
    server.port = 4101
    expect(registry.collect(execution())[AUTH_URL_KEY]).toBe('http://127.0.0.1:4101?token=t')
  })

  it('removes the contribution when its plugin fiber is disposed', async () => {
    const ctx = new Context()
    const registry = new ShellEnvRegistry(ctx, { dshHome: './auth-url-test-home' })
    ctx.provide('webServer', { port: PORT } as never)
    ctx.provide('connection', { authenticatedUrl: (base: string) => `${base}?token=t` } as never)
    const fiber = await ctx.plugin({ inject: ['shellEnv'], apply })
    expect(registry.collect(execution())[AUTH_URL_KEY]).toBe(`http://127.0.0.1:${String(PORT)}?token=t`)

    await fiber.dispose()
    expect(registry.list()).toEqual([])
    expect(registry.collect(execution())).not.toHaveProperty(AUTH_URL_KEY)
  })
})
