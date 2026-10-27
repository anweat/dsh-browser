/**
 * Inline validation of the settings card's context and download fields.
 *
 * These are the SAME rule functions the server runs when it reads the configuration (`../config-rules.ts` has no
 * imports, so the card bundle carries it unchanged): a value the card accepts is a value the plugin will use, and a
 * value it refuses is one the plugin would have dropped with a runtimeWarning. Blank always means "use the default".
 * @module dsh-browser/client/field-rules
 */

import {
  MAX_DOWNLOAD_BYTES_LIMIT, VIEWPORT_LIMITS, checkAbsoluteDirectory, checkLocale, checkProxyBypass, checkProxyServer, checkTimezone, checkUserAgent,
} from '../config-rules.ts'

class Refused extends Error {}
const fail = (message: string): never => { throw new Refused(message) }

const RULES: Record<string, (text: string) => unknown> = {
  userAgent: text => checkUserAgent(text, 'userAgent', fail),
  locale: text => checkLocale(text, 'locale', fail),
  timezoneId: text => checkTimezone(text, 'timezoneId', fail),
  proxyServer: text => checkProxyServer(text, 'proxyServer', fail),
  proxyBypass: text => checkProxyBypass(text, 'proxyBypass', fail),
  downloadDir: text => checkAbsoluteDirectory(text, 'downloadDir', fail),
}

/** Whole-number fields and their inclusive ranges (the server enforces the same ones). */
const NUMBER_RANGES: Record<string, readonly [number, number]> = {
  viewportWidth: [VIEWPORT_LIMITS.minWidth, VIEWPORT_LIMITS.maxWidth],
  viewportHeight: [VIEWPORT_LIMITS.minHeight, VIEWPORT_LIMITS.maxHeight],
  downloadMaxBytes: [1, MAX_DOWNLOAD_BYTES_LIMIT],
}

/** Fields whose text is checked here. */
export const CHECKED_TEXT_FIELDS: readonly string[] = [...Object.keys(RULES), ...Object.keys(NUMBER_RANGES)]

/** Why one field's text is refused, or undefined when it is fine (or blank). */
export function fieldProblem(field: string, text: string): string | undefined {
  if (text.trim() === '') return undefined
  const range = NUMBER_RANGES[field]
  if (range) {
    const value = Number(text)
    return Number.isInteger(value) && value >= range[0] && value <= range[1] ? undefined : `${field} must be a whole number from ${range[0]} to ${range[1]}`
  }
  const rule = RULES[field]
  if (!rule) return undefined
  try { rule(text) } catch (error) {
    if (error instanceof Refused) return error.message
    throw error
  }
  return undefined
}

/**
 * Problems that involve more than one field. `custom` needs both sizes; the sizes themselves are checked by the
 * numeric field's own range.
 */
export function crossFieldProblems(texts: Record<string, string | undefined>): Record<string, string> {
  const problems: Record<string, string> = {}
  const mode = (texts.viewportMode ?? '').trim()
  if (mode === 'custom') {
    const need = (field: 'viewportWidth' | 'viewportHeight', range: string) => {
      if ((texts[field] ?? '').trim() === '') problems[field] = `viewportMode=custom needs ${field} (${range}); without it the browser's default window is used`
    }
    need('viewportWidth', `${VIEWPORT_LIMITS.minWidth}-${VIEWPORT_LIMITS.maxWidth}`)
    need('viewportHeight', `${VIEWPORT_LIMITS.minHeight}-${VIEWPORT_LIMITS.maxHeight}`)
  }
  return problems
}
