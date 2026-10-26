/**
 * The "default parameters" editor of the settings card: every plugin-wide default as one `key = value` text.
 *
 * Process-wide and per-context defaults (browser runtime, window size, user agent, locale, proxy, directories, limits)
 * are one thing, "what each new context starts from"; an agent copies them for a task and changes only what that task
 * needs. So they are edited as one properties text instead of a field-by-field form:
 *
 *     # -- Browser context --
 *     viewportMode = custom
 *     viewportWidth = 1280
 *     # userAgent =
 *
 * A line `key = value` overrides the default; a `#` line is a comment and shows the value in force (the deployed
 * value, or the plugin's default); a key that is commented out or has no value is not overridden. The value is
 * everything after the FIRST `=`, trimmed, with one pair of surrounding double quotes removed; there are no inline
 * comments, so `#` inside a value is literal. Arrays are one JSON line. The saved configuration keeps the same flat
 * keys the old form wrote: this module only parses and prints text, nothing here writes settings.
 *
 * Pure (no DOM, no host); validation is the server's own rule set (`../config-rules.ts` through `field-rules.ts`).
 * @module dsh-browser/client/properties-form
 */

import { MAX_DOWNLOAD_BYTES_LIMIT } from '../config-rules.ts'
import { crossFieldProblems, fieldProblem } from './field-rules.ts'

export type PropertyKind = 'string' | 'boolean' | 'enum' | 'integer' | 'strings'

export interface PropertyField {
  key: string
  kind: PropertyKind
  /** The value in force when nothing is configured, as the text the editor shows in a comment line. */
  defaultText?: string
  options?: readonly string[]
  range?: readonly [number, number]
  group: 'runtime' | 'context' | 'files'
}

export const PROPERTY_GROUPS = [
  { id: 'runtime', title: 'Browser runtime' },
  { id: 'context', title: 'Browser context (window, language, egress)' },
  { id: 'files', title: 'Login state, files and limits' },
] as const

/** The default-value fields, in display order. Switches and policies (enabled, automationMode, ...) stay controls. */
export const PROPERTY_FIELDS: readonly PropertyField[] = [
  { key: 'browserRuntime', kind: 'enum', options: ['playwright', 'patchright'], defaultText: 'playwright', group: 'runtime' },
  { key: 'channel', kind: 'string', defaultText: 'chromium', group: 'runtime' },
  { key: 'headless', kind: 'boolean', defaultText: 'true', group: 'runtime' },
  { key: 'autoInstall', kind: 'boolean', defaultText: 'false', group: 'runtime' },
  { key: 'executablePath', kind: 'string', group: 'runtime' },
  { key: 'cdpPort', kind: 'integer', range: [1, 65_535], group: 'runtime' },
  { key: 'maxSessions', kind: 'integer', range: [1, 64], defaultText: '8', group: 'runtime' },
  { key: 'args', kind: 'strings', defaultText: '[]', group: 'runtime' },
  { key: 'viewportMode', kind: 'enum', options: ['window', '720p', '1080p', 'custom'], defaultText: 'window', group: 'context' },
  { key: 'viewportWidth', kind: 'integer', range: [200, 7680], group: 'context' },
  { key: 'viewportHeight', kind: 'integer', range: [200, 4320], group: 'context' },
  { key: 'userAgent', kind: 'string', group: 'context' },
  { key: 'locale', kind: 'string', group: 'context' },
  { key: 'timezoneId', kind: 'string', group: 'context' },
  { key: 'proxyServer', kind: 'string', group: 'context' },
  { key: 'proxyBypass', kind: 'string', group: 'context' },
  { key: 'storageStatePath', kind: 'string', group: 'files' },
  { key: 'defaultAuthProfile', kind: 'string', group: 'files' },
  { key: 'allowPrivateHosts', kind: 'boolean', defaultText: 'false', group: 'files' },
  { key: 'snapshotDir', kind: 'string', group: 'files' },
  { key: 'downloadDir', kind: 'string', group: 'files' },
  { key: 'downloadMaxBytes', kind: 'integer', range: [1, MAX_DOWNLOAD_BYTES_LIMIT], defaultText: '104857600', group: 'files' },
  { key: 'verbose', kind: 'boolean', defaultText: 'false', group: 'files' },
]

export const PROPERTY_KEYS: ReadonlySet<string> = new Set(PROPERTY_FIELDS.map(field => field.key))

/** Settings that exist but are edited elsewhere in the card; a line naming one is warned about, not applied. */
export const ELSEWHERE_KEYS: Readonly<Record<string, string>> = {
  enabled: 'the "automation freedom" controls', automationMode: 'the "automation freedom" controls', toolSurface: 'the "automation freedom" controls', opencliEnabled: 'the "automation freedom" controls',
  usagePolicy: 'the usage buffer JSON box', automationAssets: 'the automation asset policy JSON box', prompts: 'the prompt text section',
  authProfiles: 'the login profiles list', rulePacks: 'the configuration file (hash-pinned rule packs)',
}

export interface LineIssue {
  /** 1-based line number in the text. */
  line: number
  key?: string
  level: 'error' | 'warning'
  message: string
}

export interface ParsedProperties {
  /** The value of each key that has an uncommented, non-blank line (the last one wins; a repeat is reported). */
  values: Map<string, { value: string; line: number }>
  issues: LineIssue[]
}

/** The value text of a line's right-hand side: trimmed, one pair of surrounding double quotes removed. */
export function unquote(raw: string): string {
  const trimmed = raw.trim()
  return trimmed.length >= 2 && trimmed.startsWith('"') && trimmed.endsWith('"') ? trimmed.slice(1, -1) : trimmed
}

/** A value as it is written after `=`: quoted only when it would not survive a round trip bare. */
export function quoteValue(value: string): string {
  return value !== value.trim() || (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) ? `"${value}"` : value
}

/** Split the text into key/value lines. Syntax problems and unknown keys become issues; values are not judged here. */
export function parseProperties(text: string): ParsedProperties {
  const values = new Map<string, { value: string; line: number }>()
  const issues: LineIssue[] = []
  const lines = text.split(/\r?\n/)
  lines.forEach((raw, index) => {
    const line = index + 1
    const trimmed = raw.trim()
    if (trimmed === '' || trimmed.startsWith('#')) return
    const eq = trimmed.indexOf('=')
    if (eq <= 0) {
      issues.push({ line, level: 'error', message: `line ${line}: expected "key = value" (a line that starts with # is a comment)` })
      return
    }
    const key = trimmed.slice(0, eq).trim()
    const value = unquote(trimmed.slice(eq + 1))
    if (!/^[A-Za-z][A-Za-z0-9]*$/.test(key)) {
      issues.push({ line, key, level: 'error', message: `line ${line}: "${key.slice(0, 40)}" is not a setting name` })
      return
    }
    if (!PROPERTY_KEYS.has(key)) {
      const where = ELSEWHERE_KEYS[key]
      issues.push({ line, key, level: 'warning', message: where ? `line ${line}: ${key} is not a default parameter; it is edited in ${where}, so this line is ignored` : `line ${line}: unknown setting "${key}" is ignored` })
      return
    }
    const previous = values.get(key)
    if (previous) issues.push({ line, key, level: 'warning', message: `line ${line}: ${key} is already set on line ${previous.line}; this later line is the one used` })
    if (value === '') { values.delete(key); return }
    values.set(key, { value, line })
  })
  return { values, issues }
}

/** Why one property value is refused (the same rules the server and the old form applied), or undefined. */
export function validateProperty(field: PropertyField, value: string): string | undefined {
  switch (field.kind) {
    case 'boolean': return value === 'true' || value === 'false' ? undefined : `${field.key} must be true or false`
    case 'enum': return field.options!.includes(value) ? undefined : `${field.key} must be one of: ${field.options!.join(', ')}`
    case 'integer': {
      const number = Number(value)
      return Number.isInteger(number) && number >= field.range![0] && number <= field.range![1] ? undefined : `${field.key} must be a whole number from ${field.range![0]} to ${field.range![1]}`
    }
    case 'strings': {
      try {
        const parsed = JSON.parse(value) as unknown
        if (Array.isArray(parsed) && parsed.length > 0 && parsed.every(entry => typeof entry === 'string' && entry.length > 0)) return undefined
      } catch { /* reported below */ }
      return `${field.key} must be a JSON array of non-empty strings, for example ["--disable-gpu"]`
    }
    case 'string': return fieldProblem(field.key, value)
  }
}

/**
 * Check a parsed text: each value against its rule, then the rules that involve several keys (a custom viewport needs
 * both sizes). `effective` supplies the text in force for a key the text does not set, so a size that comes from the
 * deployed configuration still counts.
 */
export function checkProperties(parsed: ParsedProperties, effective: (key: string) => string): LineIssue[] {
  const issues = [...parsed.issues]
  for (const field of PROPERTY_FIELDS) {
    const entry = parsed.values.get(field.key)
    if (!entry) continue
    const problem = validateProperty(field, entry.value)
    if (problem) issues.push({ line: entry.line, key: field.key, level: 'error', message: `line ${entry.line}: ${problem}` })
  }
  const texts: Record<string, string> = {}
  for (const key of ['viewportMode', 'viewportWidth', 'viewportHeight']) texts[key] = parsed.values.get(key)?.value ?? effective(key)
  const cross = crossFieldProblems(texts)
  for (const [key, message] of Object.entries(cross)) {
    const line = parsed.values.get(key)?.line ?? parsed.values.get('viewportMode')?.line
    issues.push({ line: line ?? 0, key, level: 'error', message: `${line ? `line ${line}: ` : ''}${message}` })
  }
  return issues.sort((a, b) => a.line - b.line)
}

export interface PropertyView {
  key: string
  /** The value to print: the override, or the value in force (shown as a comment). */
  text: string
  overridden: boolean
}

/** Print the editor text: overridden keys as `key = value`, the rest as `# key = value-in-force`, grouped under comment headers. */
export function serializeProperties(views: readonly PropertyView[]): string {
  const byKey = new Map(views.map(view => [view.key, view]))
  const out: string[] = [
    '# Default parameters: what every new browser context starts from. An agent copies these for a task and changes only what it needs.',
    '# "key = value" overrides the default. A line starting with # is a comment and shows the value in force; delete or comment a line to go back to the default.',
    '',
  ]
  for (const group of PROPERTY_GROUPS) {
    out.push(`# -- ${group.title} --`)
    for (const field of PROPERTY_FIELDS.filter(entry => entry.group === group.id)) {
      const view = byKey.get(field.key)
      const text = view?.text ?? field.defaultText ?? ''
      out.push(view?.overridden ? `${field.key} = ${quoteValue(text)}` : `# ${field.key} =${text === '' ? '' : ' ' + text}`)
    }
    out.push('')
  }
  return out.join('\n').replace(/\n+$/, '\n')
}

/** `text` with the lines that set `key` turned into a comment showing `shown` (the deployed value or default). */
export function commentOutProperty(text: string, key: string, shown: string): string {
  return text.split('\n').map(raw => {
    const trimmed = raw.trim()
    if (trimmed === '' || trimmed.startsWith('#')) return raw
    const eq = trimmed.indexOf('=')
    return eq > 0 && trimmed.slice(0, eq).trim() === key ? `# ${key} =${shown === '' ? '' : ' ' + shown}` : raw
  }).join('\n')
}
