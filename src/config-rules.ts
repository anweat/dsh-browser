/**
 * The value rules of the context and download settings, with no imports at all: the server (config parsing, per-call
 * arguments) and the settings card (inline validation before a save) run the same functions, so the two cannot drift.
 * The caller supplies `fail`, which throws whatever error type suits it.
 * @module dsh-browser/config-rules
 */

export const VIEWPORT_MODES = ['window', '720p', '1080p', 'custom'] as const
export type ViewportMode = typeof VIEWPORT_MODES[number]

/** Bounds of a custom viewport, in CSS pixels. */
export const VIEWPORT_LIMITS = { minWidth: 200, maxWidth: 7680, minHeight: 200, maxHeight: 4320 } as const

export const PRESET_VIEWPORTS: Record<'720p' | '1080p', { width: number; height: number }> = {
  '720p': { width: 1280, height: 720 },
  '1080p': { width: 1920, height: 1080 },
}

// A user agent is one header value; control characters would split it.
const CONTROL = /[\u0000-\u001f\u007f]/
const PROXY_SCHEMES = ['http:', 'https:', 'socks5:', 'socks4:']

type Fail = (message: string) => never

function checkInteger(value: unknown, label: string, min: number, max: number, fail: Fail): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
    fail(`${label} must be an integer from ${min} to ${max}`)
  }
  return value as number
}

export function checkViewport(width: unknown, height: unknown, label: string, fail: Fail): { width: number; height: number } {
  return {
    width: checkInteger(width, `${label} width`, VIEWPORT_LIMITS.minWidth, VIEWPORT_LIMITS.maxWidth, fail),
    height: checkInteger(height, `${label} height`, VIEWPORT_LIMITS.minHeight, VIEWPORT_LIMITS.maxHeight, fail),
  }
}

export function checkUserAgent(value: unknown, label: string, fail: Fail): string {
  if (typeof value !== 'string' || !value.trim() || value.length > 512 || CONTROL.test(value)) {
    fail(`${label} must be 1 to 512 characters without control characters`)
  }
  return (value as string).trim()
}

export function checkLocale(value: unknown, label: string, fail: Fail): string {
  if (typeof value !== 'string' || !value.trim()) fail(`${label} must be a BCP 47 language tag such as en-US or zh-CN`)
  try {
    const [canonical] = Intl.getCanonicalLocales((value as string).trim())
    if (canonical) return canonical
  } catch { /* falls through to the failure below */ }
  return fail(`${label} "${String(value)}" is not a valid BCP 47 language tag (examples: en-US, zh-CN, de-DE)`)
}

export function checkTimezone(value: unknown, label: string, fail: Fail): string {
  if (typeof value !== 'string' || !value.trim()) fail(`${label} must be an IANA time zone such as Asia/Shanghai or America/New_York`)
  const zone = (value as string).trim()
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone })
    return zone
  } catch {
    return fail(`${label} "${zone}" is not a known IANA time zone (examples: Asia/Shanghai, America/New_York, UTC)`)
  }
}

/**
 * A proxy server address: `http://host:port`, `https://...`, `socks5://...` or `socks4://...`; a bare
 * `host:port` means http. Anything carrying credentials is refused.
 */
export function checkProxyServer(value: unknown, label: string, fail: Fail): string {
  if (typeof value !== 'string' || !value.trim() || value.length > 512 || CONTROL.test(value)) {
    fail(`${label} must be a proxy address such as http://127.0.0.1:7890 or socks5://127.0.0.1:1080`)
  }
  const raw = (value as string).trim()
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : 'http://' + raw
  let parsed: URL
  try { parsed = new URL(withScheme) } catch { return fail(`${label} "${raw}" is not a valid proxy address (expected scheme://host:port)`) }
  if (!PROXY_SCHEMES.includes(parsed.protocol)) fail(`${label} scheme must be one of http, https, socks5, socks4 (got ${parsed.protocol.replace(':', '')})`)
  if (parsed.username || parsed.password) fail(`${label} must not contain credentials; proxy accounts are not supported`)
  if (!parsed.hostname) fail(`${label} "${raw}" has no host`)
  if ((parsed.pathname !== '/' && parsed.pathname !== '') || parsed.search || parsed.hash) fail(`${label} must be only scheme://host:port, without a path or query`)
  return `${parsed.protocol}//${parsed.host}`
}

export function checkProxyBypass(value: unknown, label: string, fail: Fail): string {
  if (typeof value !== 'string' || !value.trim() || value.length > 1_000 || CONTROL.test(value)) {
    fail(`${label} must be a comma-separated host list of up to 1000 characters, such as example.com,.internal.test`)
  }
  return (value as string).split(',').map(part => part.trim()).filter(Boolean).join(',')
}


const ABSOLUTE_PATH = /^(\/|[A-Za-z]:[\\/]|\\\\)/

/** A directory setting must be an absolute path (POSIX, drive letter, or UNC); a relative one would depend on the host's working directory. */
export function checkAbsoluteDirectory(value: unknown, label: string, fail: Fail): string {
  if (typeof value !== 'string' || !value.trim() || value.length > 1_000 || CONTROL.test(value)) fail(`${label} must be an absolute directory path of up to 1000 characters`)
  const text = (value as string).trim()
  if (!ABSOLUTE_PATH.test(text)) fail(`${label} must be an absolute directory path (got a relative one: ${text.slice(0, 60)})`)
  return text
}

/** The Fail type for callers that do not import it separately. */
export type RuleFail = Fail
