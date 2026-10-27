/**
 * Browser-context creation options: viewport, user agent, locale, time zone and proxy.
 *
 * These can only be chosen when a context is created (Playwright has no way to change a proxy or user agent
 * afterwards), so there are two layers: configuration defaults that apply to every context the plugin creates,
 * and per-call overrides on `target.open`. {@link effectiveContextOptions} merges the two into the one plain
 * shape {@link toPlaywrightOptions} turns into `browser.newContext()` arguments, and
 * {@link sameContextOptions} is what the session uses to decide between reusing its context and rebuilding it.
 *
 * Proxy credentials are deliberately not supported: a username or password would have to live in the
 * configuration or in a tool call, and neither is a place for secrets.
 * @module dsh-browser/context-options
 */

import { ActionArgError } from './actions/types.ts'

export {
  VIEWPORT_MODES, VIEWPORT_LIMITS, checkViewport, checkUserAgent, checkLocale, checkTimezone, checkProxyServer, checkProxyBypass,
  type ViewportMode,
} from './config-rules.ts'
import {
  VIEWPORT_MODES, PRESET_VIEWPORTS, checkViewport, checkUserAgent, checkLocale, checkTimezone, checkProxyServer, checkProxyBypass,
  type ViewportMode, type RuleFail as Fail,
} from './config-rules.ts'

/** The options a context is created with. Every field is optional; an absent field keeps Playwright's default. */
export interface ContextOptions {
  viewport?: { width: number; height: number }
  userAgent?: string
  locale?: string
  timezoneId?: string
  proxy?: { server: string; bypass?: string }
}

/** The configuration keys behind {@link ContextOptions}, as `resolveConfig` reads them. */
export interface ContextOptionsInput {
  viewportMode?: unknown
  viewportWidth?: unknown
  viewportHeight?: unknown
  userAgent?: unknown
  locale?: unknown
  timezoneId?: unknown
  proxyServer?: unknown
  proxyBypass?: unknown
}

/** A configuration problem that is not fatal: the value is ignored and this is shown in `runtime.status`. */
export type ConfigWarning = string

/** Thrown inside {@link resolveContextDefaults} by the shared rules; caught per key, never escapes. */
class ConfigValueError extends Error {}
const configFail: Fail = (message: string): never => { throw new ConfigValueError(message) }

const blank = (value: unknown): boolean => value === undefined || value === null || value === ''

/** A short, safe rendering of a configured value for a warning (credentials in a proxy URL are masked). */
export function summarizeValue(value: unknown): string {
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  const text = typeof value === 'string' ? value : JSON.stringify(value) ?? String(value)
  return JSON.stringify(text.replace(/\/\/[^/@\s]*@/g, '//***@').slice(0, 60))
}

/** The warning for a configuration key whose value was refused: which key, what was there, why, what applies instead. */
export function configProblem(key: string, value: unknown, reason: string, fallback: string, fix: string): ConfigWarning {
  return `config ${key}=${summarizeValue(value)} was ignored: ${reason}; ${fallback} instead. Fix: ${fix}`
}

/**
 * Read the context defaults from the configuration. This never throws: a value that is refused is dropped, the key
 * falls back to its default (the browser's own behaviour), and the reason is returned as a warning that names the
 * key, the value and how to fix it. A configuration problem must not stop the plugin from loading, because a plugin
 * that does not load also takes its settings card with it.
 */
export function resolveContextDefaults(input: ContextOptionsInput): { options: ContextOptions; warnings: ConfigWarning[] } {
  const warnings: ConfigWarning[] = []
  const options: ContextOptions = {}
  const attempt = (key: string, value: unknown, fallback: string, fix: string, run: () => void): void => {
    try { run() } catch (error) {
      if (!(error instanceof ConfigValueError)) throw error
      warnings.push(configProblem(key, value, error.message, fallback, fix))
    }
  }
  let mode: string = 'window'
  attempt('viewportMode', input.viewportMode, 'the browser\'s default window size applies', `use one of ${VIEWPORT_MODES.join(', ')}`, () => {
    if (blank(input.viewportMode)) return
    if (typeof input.viewportMode !== 'string' || !VIEWPORT_MODES.includes(input.viewportMode as ViewportMode)) {
      configFail('viewportMode must be one of: ' + VIEWPORT_MODES.join(', '))
    }
    mode = input.viewportMode as string
  })
  const hasSize = !blank(input.viewportWidth) || !blank(input.viewportHeight)
  if (mode === 'custom') {
    attempt('viewportMode', 'custom', 'the browser\'s default window size applies', 'set both viewportWidth (200-7680) and viewportHeight (200-4320), or choose window, 720p or 1080p', () => {
      if (blank(input.viewportWidth) || blank(input.viewportHeight)) configFail('viewportMode=custom requires both viewportWidth and viewportHeight')
      options.viewport = checkViewport(input.viewportWidth, input.viewportHeight, 'viewport', configFail)
    })
  } else if (mode === '720p' || mode === '1080p') {
    options.viewport = { ...PRESET_VIEWPORTS[mode] }
    if (hasSize) warnings.push(`config viewportWidth/viewportHeight are ignored: they only apply with viewportMode=custom (viewportMode is ${mode})`)
  } else if (hasSize) {
    warnings.push('config viewportWidth/viewportHeight are ignored: they only apply with viewportMode=custom (viewportMode is window)')
  }
  const simple: [string, unknown, (value: unknown) => string, (value: string) => void, string][] = [
    ['userAgent', input.userAgent, value => checkUserAgent(value, 'userAgent', configFail), value => { options.userAgent = value }, 'use up to 512 characters without line breaks, or clear it'],
    ['locale', input.locale, value => checkLocale(value, 'locale', configFail), value => { options.locale = value }, 'use a BCP 47 tag such as en-US or zh-CN, or clear it'],
    ['timezoneId', input.timezoneId, value => checkTimezone(value, 'timezoneId', configFail), value => { options.timezoneId = value }, 'use an IANA time zone such as Asia/Shanghai, or clear it'],
  ]
  for (const [key, value, check, apply, fix] of simple) {
    if (blank(value)) continue
    attempt(key, value, 'the browser\'s own value applies', fix, () => apply(check(value)))
  }
  let proxyOk = false
  if (!blank(input.proxyServer)) {
    attempt('proxyServer', input.proxyServer, 'no proxy is used (direct connection)', 'use http://host:port or socks5://host:port without an account or password, or clear it', () => {
      options.proxy = { server: checkProxyServer(input.proxyServer, 'proxyServer', configFail) }
      proxyOk = true
    })
  }
  if (!blank(input.proxyBypass)) {
    if (proxyOk) {
      attempt('proxyBypass', input.proxyBypass, 'the bypass list is not applied', 'use comma-separated hosts such as example.com,.internal.test, or clear it', () => {
        options.proxy!.bypass = checkProxyBypass(input.proxyBypass, 'proxyBypass', configFail)
      })
    } else warnings.push('config proxyBypass is ignored: it only applies together with a valid proxyServer')
  }
  return { options, warnings }
}

/** The per-call options of `target.open`, as they arrive from the model. */
export interface CallContextInput {
  viewport?: { width?: unknown; height?: unknown }
  userAgent?: unknown
  locale?: unknown
  timezoneId?: unknown
  proxyServer?: unknown
}

const callFail: Fail = (message: string): never => { throw new ActionArgError(message) }

/** Validate per-call overrides. Throws {@link ActionArgError} (INVALID_ARGS) naming the argument. */
export function resolveCallOptions(input: CallContextInput | undefined): ContextOptions {
  const options: ContextOptions = {}
  if (!input) return options
  if (input.viewport !== undefined) {
    if (typeof input.viewport !== 'object' || input.viewport === null) callFail('viewport must be an object {width, height}')
    options.viewport = checkViewport(input.viewport.width, input.viewport.height, 'viewport', callFail)
  }
  if (input.userAgent !== undefined) options.userAgent = checkUserAgent(input.userAgent, 'userAgent', callFail)
  if (input.locale !== undefined) options.locale = checkLocale(input.locale, 'locale', callFail)
  if (input.timezoneId !== undefined) options.timezoneId = checkTimezone(input.timezoneId, 'timezoneId', callFail)
  if (input.proxyServer !== undefined) options.proxy = { server: checkProxyServer(input.proxyServer, 'proxyServer', callFail) }
  return options
}

/**
 * Configuration defaults overlaid with the per-call options. A per-call `proxyServer` replaces the configured
 * proxy as a whole, bypass list included: a bypass list written for one proxy says nothing about another.
 */
export function effectiveContextOptions(defaults: ContextOptions, call: ContextOptions = {}): ContextOptions {
  return {
    ...defaults,
    ...call,
  }
}

/** Whether two option sets would create indistinguishable contexts. */
export function sameContextOptions(a: ContextOptions, b: ContextOptions): boolean {
  return (a.viewport?.width ?? 0) === (b.viewport?.width ?? 0)
    && (a.viewport?.height ?? 0) === (b.viewport?.height ?? 0)
    && a.userAgent === b.userAgent
    && a.locale === b.locale
    && a.timezoneId === b.timezoneId
    && a.proxy?.server === b.proxy?.server
    && a.proxy?.bypass === b.proxy?.bypass
}

/** Names of the options that differ, for the "context was rebuilt" notice. */
export function differingContextOptions(applied: ContextOptions, wanted: ContextOptions): string[] {
  const names: string[] = []
  if ((applied.viewport?.width ?? 0) !== (wanted.viewport?.width ?? 0) || (applied.viewport?.height ?? 0) !== (wanted.viewport?.height ?? 0)) names.push('viewport')
  if (applied.userAgent !== wanted.userAgent) names.push('userAgent')
  if (applied.locale !== wanted.locale) names.push('locale')
  if (applied.timezoneId !== wanted.timezoneId) names.push('timezoneId')
  if (applied.proxy?.server !== wanted.proxy?.server || applied.proxy?.bypass !== wanted.proxy?.bypass) names.push('proxyServer')
  return names
}

/** The `newContext()` arguments for a set of options: only the fields that are set, so an unset field keeps today's behaviour. */
export function toPlaywrightOptions(options: ContextOptions): Record<string, unknown> {
  return {
    ...options.viewport ? { viewport: { ...options.viewport } } : {},
    ...options.userAgent ? { userAgent: options.userAgent } : {},
    ...options.locale ? { locale: options.locale } : {},
    ...options.timezoneId ? { timezoneId: options.timezoneId } : {},
    ...options.proxy ? { proxy: { server: options.proxy.server, ...options.proxy.bypass ? { bypass: options.proxy.bypass } : {} } } : {},
  }
}

/** Which parameter each value of an applied set comes from: this call, an earlier call of the session (carried by its context), or the defaults. */
export function contextSources(applied: ContextOptions, defaults: ContextOptions, call: ContextOptions): Record<string, 'call' | 'session' | 'default'> {
  const sources: Record<string, 'call' | 'session' | 'default'> = {}
  const decide = (key: string, present: boolean, inCall: boolean, same: boolean): void => {
    if (present) sources[key] = inCall ? 'call' : same ? 'default' : 'session'
  }
  const sameAs = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
  decide('viewport', !!applied.viewport, !!call.viewport, sameAs(applied.viewport, defaults.viewport))
  decide('userAgent', !!applied.userAgent, !!call.userAgent, applied.userAgent === defaults.userAgent)
  decide('locale', !!applied.locale, !!call.locale, applied.locale === defaults.locale)
  decide('timezoneId', !!applied.timezoneId, !!call.timezoneId, applied.timezoneId === defaults.timezoneId)
  decide('proxyServer', !!applied.proxy, !!call.proxy, applied.proxy?.server === defaults.proxy?.server && applied.proxy?.bypass === defaults.proxy?.bypass)
  return sources
}

/** One line for the action detail: the context defaults in force, so a caller changes only what it needs. */
export function describeDefaultsLine(defaults: ContextOptions): string {
  const view = describeContextOptions(defaults) as { viewport?: { width: number; height: number }; userAgent?: string; locale?: string; timezoneId?: string; proxyServer?: string }
  const shown = (value: string | undefined, none: string) => value ?? none
  return 'Current defaults (a parameter you leave out uses them; give only the keys you change): '
    + `viewport ${view.viewport ? `${view.viewport.width}x${view.viewport.height}` : 'window default'}, `
    + `userAgent ${shown(view.userAgent && JSON.stringify(view.userAgent.length > 60 ? view.userAgent.slice(0, 57) + '...' : view.userAgent), "browser's own")}, `
    + `locale ${shown(view.locale, "browser's own")}, timezoneId ${shown(view.timezoneId, "machine's")}, proxyServer ${shown(view.proxyServer, 'none')}. `
    + 'This session\'s own context may carry earlier overrides; the result of target.open lists the full set in effect.'
}

/** The options as the model sees them in a result: only what was actually set. */
export function describeContextOptions(options: ContextOptions): Record<string, unknown> {
  return {
    ...options.viewport ? { viewport: { ...options.viewport } } : {},
    ...options.userAgent ? { userAgent: options.userAgent } : {},
    ...options.locale ? { locale: options.locale } : {},
    ...options.timezoneId ? { timezoneId: options.timezoneId } : {},
    ...options.proxy ? { proxyServer: options.proxy.server } : {},
  }
}
