/**
 * @deepseek-ai/dsh-experimental-browser-use-profile — the runtime glue of the
 * experimental browser-tools profile bundle. Its `dsh.bundle.patch` mounts the
 * capability service and one Playwright MCP provider; this module publishes the
 * one fact those tools need to reach the running Web GUI: the authenticated
 * application URL.
 *
 * The Web runtime hands the model the *clean* `DSH_WEB_URL`, which a fresh
 * browser profile cannot open — the root answers 401 until a request presents
 * this process's launch token, or the cookie that token exchange mints. A
 * browser tool therefore needs the token-bearing variant, and {@link apply}
 * contributes it as a separate managed variable instead of changing the Web
 * runtime's variable.
 * @module @deepseek-ai/dsh-experimental-browser-use-profile
 */

import type { Context } from '@deepseek-ai/cordis'
import type { } from '@deepseek-ai/dsh-client-connection'
import type { } from '@deepseek-ai/dsh-host-webserver'
import type { } from '@deepseek-ai/dsh-shell-env'
import type { } from '@deepseek-ai/dsh-system-prompt'

/** Stable Cordis plugin name. */
export const name = 'experimental-browser-use-profile'

/** Loopback host the Web runtime binds and the browser-session cookie is bound to. */
const LOOPBACK_HOST = '127.0.0.1'

/** Managed variable holding the token-bearing Web GUI URL. */
const DSH_WEB_AUTH_URL = 'DSH_WEB_AUTH_URL' as const

/**
 * Publish the authenticated Web GUI URL to every model shell call, and tell the
 * Session that the browser tools it now has are meant for that GUI.
 *
 * Both contributions inject their services rather than requiring them, because
 * a profile may select this bundle without `dsh-web-app`. The resolver therefore
 * withholds the variable unless both services are present, so it never publishes
 * the unauthenticated origin under a name that promises a launch token. The URL
 * is resolved per execution and never cached: the launch token belongs to the
 * live process, and the Web server and connection service mount after this plugin.
 * @param ctx - plugin context supplying the shell environment and prompt registries.
 */
export function apply(ctx: Context): void {
  ctx.inject(['shellEnv'], (shellCtx) => {
    shellCtx.shellEnv.register({
      name: 'browser-use-profile',
      variables: {
        [DSH_WEB_AUTH_URL]: {
          description: 'Authenticated URL of the DeepSeek Harness Web GUI including this '
            + 'process\'s launch token; open it to reach the GUI from a fresh browser profile.',
        },
      },
      resolve: () => {
        const port = ctx.get('webServer')?.port
        if (port === undefined) return {}
        const connection = ctx.get('connection')
        if (connection === undefined) return {}
        const cleanUrl = `http://${LOOPBACK_HOST}:${String(port)}`
        return { [DSH_WEB_AUTH_URL]: connection.authenticatedUrl(cleanUrl) }
      },
    })
  })

  // Tool schemas alone do not tell a Session that the GUI the user is looking at
  // is a reachable target. This static layer states that stable fact; the URL
  // itself stays in the managed variable above.
  ctx.inject(['systemPrompt'], (promptCtx) => {
    promptCtx.systemPrompt.section({
      name: 'app:browser-surface',
      order: promptCtx.systemPrompt.getSectionOrder('WEB_SURFACE'),
      text: 'Browser automation tools are available in this Session. To inspect the Web GUI the user is '
        + 'looking at, open `$DSH_WEB_AUTH_URL` from bash: it carries the launch token that authenticates a '
        + 'fresh browser profile, while `DSH_WEB_URL` alone answers 401. Check the GUI this way and read its '
        + 'console errors before reporting a result that depends on it.',
    })
  })
}
