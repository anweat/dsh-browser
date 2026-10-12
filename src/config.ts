/**
 * dsh-browser plugin configuration (schemastery) and the resolved runtime shape.
 * @module dsh-browser/config
 */

import path from 'node:path'
import os from 'node:os'
import z from '@deepseek-ai/schemastery'
import type { AuthProfileConfig } from './auth-profiles.ts'
import type { RulePackConfig } from './rule-packs.ts'
import { resolveAutomationMode, resolveToolSurface, type AutomationMode, type ToolSurface } from './freedom.ts'
import { resolveUsagePolicy, type UsagePolicy, type UsagePolicyInput } from './usage-policy.ts'
import { PROMPT_LIMITS } from './prompt-limits.ts'
import { promptsSource, type PromptsSource } from './prompts.ts'
import { resolveAutomationAssetPolicy, type AutomationAssetPolicy, type AutomationAssetPolicyInput } from './automation-assets.ts'
import { VIEWPORT_LIMITS, VIEWPORT_MODES, configProblem, resolveContextDefaults, type ContextOptions, type ViewportMode } from './context-options.ts'
import { MAX_DOWNLOAD_BYTES_LIMIT, checkAbsoluteDirectory } from './config-rules.ts'
export { MAX_DOWNLOAD_BYTES_LIMIT }

/** Schema keys that are not settings (see {@link MISPLACED_KEYS}); the settings card has no control for them. */
export const MISPLACED_CONFIG_KEYS: readonly string[] = ['viewport', 'proxy', 'contextOptions', 'download', 'downloads']

export const DEFAULT_DOWNLOAD_MAX_BYTES = 100 * 1024 * 1024

export const BROWSER_RUNTIMES = ['playwright', 'patchright'] as const
export type BrowserRuntime = typeof BROWSER_RUNTIMES[number]

export function resolveBrowserRuntime(value: unknown): BrowserRuntime {
  const runtime = value ?? 'playwright'
  if (typeof runtime !== 'string' || !BROWSER_RUNTIMES.includes(runtime as BrowserRuntime)) {
    throw new Error('browserRuntime must be one of: ' + BROWSER_RUNTIMES.join(', '))
  }
  return runtime as BrowserRuntime
}

/** The `prompts` configuration (see `src/prompts.ts`). Unknown keys are tolerated at parse time and reported as diagnostics. */
export interface PromptsInput {
  tools?: { browser_index?: { description?: string }; browser_call?: { description?: string } }
  rootGuide?: string
  rootNote?: string
  groups?: Record<string, { summary?: string }>
  actions?: Record<string, { summary?: string; notes?: string }>
  errorHints?: Record<string, string>
  skill?: { enabled?: boolean; description?: string; bodyFile?: string; append?: string }
}

export interface Config {
  /** Whether the browser service is active. */
  enabled: boolean
  /** Browser channel: 'chromium' (bundled, self-contained) or 'msedge'. */
  channel: string
  /** Browser driver/runtime implementation. Patchright is Chromium-only. */
  browserRuntime?: BrowserRuntime
  headless: boolean
  /** Path to a Playwright storageState JSON (persisted login state). */
  storageStatePath?: string
  /** Named, domain-scoped reusable login states. */
  authProfiles?: Record<string, AuthProfileConfig>
  /** Optional named profile used when a caller does not select one. */
  defaultAuthProfile?: string
  /** Domain-scoped, hash-pinned browser enhancement packs. */
  rulePacks?: Record<string, RulePackConfig>
  /** Explicit browser executable path override (rare). */
  executablePath?: string
  /** Whether the bundled OpenCLI is enabled. */
  opencliEnabled: boolean
  /** Model-facing tool exposure and approval level. */
  automationMode: AutomationMode
  /**
   * How browser capabilities reach the model: `indexed` (default) exposes two
   * small tools, `browser_index` + `browser_call`; `flat` registers one tool per
   * action (a much larger always-on context cost).
   */
  toolSurface?: ToolSurface
  /** Approval-independent traffic buffering and bounded crawl budgets. */
  usagePolicy?: UsagePolicyInput
  /** Reusable automation capture, review, activation, and retrieval policy. */
  automationAssets?: AutomationAssetPolicyInput
  /**
   * Deployment overrides of the model-facing text (tool descriptions, root guide, catalog summaries and notes,
   * error hints, the skill). Every field is optional; the settings card button Export default text (or `prompts:dump`) shows the full structure with defaults.
   */
  prompts?: PromptsInput
  /** Lazily run `playwright install chromium` when the browser is missing. */
  autoInstall: boolean
  /** Directory for browser screenshots; defaults to $DSH_HOME/data/browser/snapshots. */
  snapshotDir?: string
  /**
   * Whether a policy change made through the agent actions may name localhost, `.local`/`.internal` names and
   * loopback or private-network IPv4 addresses as allowed domains. Off by default; cloud metadata and link-local
   * addresses are refused regardless.
   */
  allowPrivateHosts?: boolean
  /** Directory the downloads of `target.download` and browser-triggered downloads are saved to; defaults to $DSH_HOME/data/browser/downloads. */
  downloadDir?: string
  /** Largest single download in bytes; a bigger one is aborted and removed. Default 100 MiB. */
  downloadMaxBytes?: number
  /**
   * Viewport of every context the plugin creates: `window` (default, Playwright's own default size),
   * `720p` (1280x720), `1080p` (1920x1080) or `custom` (viewportWidth x viewportHeight).
   */
  viewportMode?: ViewportMode
  /** Custom viewport width in CSS pixels; only read with viewportMode=custom. */
  viewportWidth?: number
  /** Custom viewport height in CSS pixels; only read with viewportMode=custom. */
  viewportHeight?: number
  /** User agent of every context; unset keeps the browser's own. */
  userAgent?: string
  /** BCP 47 locale of every context (en-US, zh-CN); unset keeps the browser's own. */
  locale?: string
  /** IANA time zone of every context (Asia/Shanghai); unset keeps the machine's. */
  timezoneId?: string
  /** Proxy of every context: `http://host:port`, `socks5://host:port`. No account or password is supported. */
  proxyServer?: string
  /** Comma-separated hosts that skip the proxy (`example.com,.internal.test`); needs proxyServer. */
  proxyBypass?: string
  verbose: boolean
  /** Optional remote debugging port to expose CDP for external tools (e.g. 9222). */
  cdpPort?: number
  /** Additional Chromium CLI launch arguments. */
  args?: string[]
  /**
   * How many sessions may hold a browser context+page at once. Past this the
   * least-recently-used session is closed. One shared browser process serves
   * them all, so this bounds contexts, not processes.
   */
  maxSessions?: number
}

// The `as unknown as z<Config>` is required because a `.volatile()` field
// resolves to a live `Volatile<T>` handle rather than a plain `T`, so the
// schema's inferred output no longer overlaps `Config` structurally. The cast
// is honest about that: `resolveConfig` still normalizes handles to plain
// values at the boundary every consumer reads through.
export const Config = z.object({
  // `.volatile()` is what makes a field appear on the generated settings page:
  // `volatileForm(schema)` keeps only fields with a marked nearest volatile
  // ancestor and returns undefined for a whole schema with none, in which case
  // the entry is skipped entirely and no page exists. Fields left unmarked stay
  // composition-only (not editable live), which is deliberate for the ones
  // carrying hash-pinned scripts.
  enabled: z.boolean().default(true).volatile(),
  channel: z.string().default('chromium').volatile(),
  browserRuntime: z.string().default('playwright').volatile(),
  headless: z.boolean().default(true).volatile(),
  storageStatePath: z.string().volatile(),
  authProfiles: z.dict(z.object({
    storageStatePath: z.string(),
    allowedDomains: z.array(z.string()).default([]),
    persistState: z.boolean().default(false),
  })).volatile(),
  defaultAuthProfile: z.string().volatile(),
  rulePacks: z.dict(z.object({
    matches: z.array(z.string()).default([]),
    initScriptPath: z.string(),
    initScriptSha256: z.string(),
    steps: z.array(z.object({
      type: z.string(),
      selector: z.string(),
      timeoutMs: z.number(),
      optional: z.boolean(),
      deltaY: z.number(),
      repeat: z.number(),
      waitMs: z.number(),
    })).default([]),
  })),
  executablePath: z.string().volatile(),
  opencliEnabled: z.boolean().default(true).volatile(),
  automationMode: z.string().default('standard').volatile(),
  toolSurface: z.string().default('indexed').volatile(),
  usagePolicy: z.object({
    minDelayMs: z.number().default(750),
    maxConcurrency: z.number().default(2),
    burst: z.number().default(3),
    maxPagesPerRun: z.number().default(20),
    maxDepth: z.number().default(2),
    retryLimit: z.number().default(2),
    backoffBaseMs: z.number().default(1000),
    cooldownMs: z.number().default(30000),
  }).volatile(),
  automationAssets: z.object({
    enabled: z.boolean().default(true),
    directory: z.string(),
    persistenceMode: z.string().default('suggest'),
    activationMode: z.string().default('manual'),
    minSuccessfulRuns: z.number().default(3),
    minDistinctSessions: z.number().default(2),
    successWindowDays: z.number().default(14),
    minSuccessRate: z.number().default(0.8),
    maxCandidates: z.number().default(20),
    candidateTtlDays: z.number().default(14),
    maxSuggestionsPerDay: z.number().default(2),
    maxDrafts: z.number().default(10),
    maxActiveAssets: z.number().default(50),
    retrievalTopK: z.number().default(5),
    catalogTokenBudget: z.number().default(800),
    modelDevelopmentEnabled: z.boolean().default(true),
    maxModelDraftWritesPerSession: z.number().default(3),
    maxTestCredentials: z.number().default(5),
    minInputSetsForActivation: z.number().default(2),
  }).volatile(),
  prompts: z.object({
    tools: z.object({
      browser_index: z.object({ description: z.string().description(`Replaces the browser_index tool description. At most ${PROMPT_LIMITS.description} characters. Applies after a restart (tool descriptions are fixed at registration).`) }),
      browser_call: z.object({ description: z.string().description(`Replaces the browser_call tool description; the compliance notice is always appended. At most ${PROMPT_LIMITS.description} characters. Applies after a restart.`) }),
    }),
    rootGuide: z.string().description(`Replaces the compact guide the browser_index root shows when no skill is available. At most ${PROMPT_LIMITS.rootGuide} characters.`),
    rootNote: z.string().description(`Your own advice, appended at the end of the browser_index root (also when the skill is available). At most ${PROMPT_LIMITS.rootNote} characters.`),
    groups: z.dict(z.object({ summary: z.string().description(`Replaces the group summary. At most ${PROMPT_LIMITS.summary} characters.`) })).description('Keyed by group name (runtime, target, observe, act, inspect, script, automation, crawl, opencli). Unknown names are ignored.'),
    actions: z.dict(z.object({
      summary: z.string().description(`Replaces the one-line summary. At most ${PROMPT_LIMITS.summary} characters.`),
      notes: z.string().description(`Replaces the extra guidance shown in the action detail. At most ${PROMPT_LIMITS.notes} characters (${PROMPT_LIMITS.topicText} for a detail topic, where it replaces the whole page text).`),
    })).description('Keyed by group.action, group.action.sub (automation.develop.save) or group.action.topic (observe.read.controls). Unknown keys are ignored.'),
    errorHints: z.dict(z.string()).description(`Keyed by error code; replaces the hint that comes with it. At most ${PROMPT_LIMITS.errorHint} characters each. Only codes with a fixed hint can be replaced; others are ignored.`),
    skill: z.object({
      enabled: z.boolean().default(true).description('false: the dsh-browser skill is not registered and the root shows the compact guide instead.'),
      description: z.string().description(`Replaces the skill description. At most ${PROMPT_LIMITS.skillDescription} characters.`),
      bodyFile: z.string().description(`Absolute path of a Markdown file replacing the SKILL.md body (at most ${PROMPT_LIMITS.skillBodyFile} characters). A missing or unreadable file falls back to the packaged body.`),
      append: z.string().description(`Text appended to the end of the skill body. At most ${PROMPT_LIMITS.skillAppend} characters.`),
    }),
  }).description('Overrides of the model-facing text. The settings card button Export default text (or `pnpm prompts:dump` in a repository checkout) prints every key with its default. Values over the length limits and unknown keys are ignored and reported by runtime.status. Tool descriptions apply after a restart; everything else applies on the next call.').volatile(),
  autoInstall: z.boolean().default(false).volatile(),
  snapshotDir: z.string().volatile(),
  allowPrivateHosts: z.boolean().default(false).description('Let agent policy changes name localhost, .local/.internal names and private-network IPv4 addresses as allowed domains').volatile(),
  downloadDir: z.string().description('Absolute directory downloads are saved to; defaults to $DSH_HOME/data/browser/downloads').volatile(),
  downloadMaxBytes: z.number().default(DEFAULT_DOWNLOAD_MAX_BYTES).description('Largest single download in bytes (default 100 MiB); a bigger one is aborted and removed').volatile(),
  viewportMode: z.string().default('window').description(`Viewport of every context: ${VIEWPORT_MODES.join(' | ')} (window = the browser default)`).volatile(),
  viewportWidth: z.number().description(`Custom viewport width, ${VIEWPORT_LIMITS.minWidth}-${VIEWPORT_LIMITS.maxWidth}; only with viewportMode=custom`).volatile(),
  viewportHeight: z.number().description(`Custom viewport height, ${VIEWPORT_LIMITS.minHeight}-${VIEWPORT_LIMITS.maxHeight}; only with viewportMode=custom`).volatile(),
  userAgent: z.string().description('User agent of every context; unset keeps the browser\'s own').volatile(),
  locale: z.string().description('BCP 47 locale such as en-US or zh-CN').volatile(),
  timezoneId: z.string().description('IANA time zone such as Asia/Shanghai').volatile(),
  proxyServer: z.string().description('Proxy such as http://127.0.0.1:7890 or socks5://127.0.0.1:1080; accounts and passwords are not supported').volatile(),
  proxyBypass: z.string().description('Comma-separated hosts that skip the proxy; needs proxyServer').volatile(),
  // The ranges of the numbers above are NOT part of the schema on purpose: schema parsing rejects a value outside a
  // range with an error that stops the plugin from loading, while `resolveConfig` reports it and falls back (the
  // settings card enforces the same ranges before a save).
  // Not settings: these names exist so that the nested shape people expect fails loudly in `resolveConfig`
  // instead of being dropped by schema parsing, which is how a nested `viewport` was once ignored without a word.
  viewport: z.any(),
  proxy: z.any(),
  contextOptions: z.any(),
  download: z.any(),
  downloads: z.any(),
  verbose: z.boolean().default(false).volatile(),
  cdpPort: z.number().min(1).max(65_535).step(1).description('Optional remote debugging port to expose CDP for external tools (e.g. 9222)').volatile(),
  args: z.array(z.string()).default([]).description('Additional Chromium CLI launch arguments').volatile(),
  maxSessions: z.number().min(1).max(64).step(1).default(8).description('Sessions that may hold a browser page at once; the least-recently-used one is closed past this. One browser process is shared by all of them.').volatile(),
}) as unknown as z<Config>

export interface ResolvedConfig {
  enabled: boolean
  channel: string
  browserRuntime: BrowserRuntime
  headless: boolean
  storageStatePath?: string
  authProfiles: Record<string, AuthProfileConfig>
  defaultAuthProfile?: string
  rulePacks: Record<string, RulePackConfig>
  executablePath?: string
  opencliEnabled: boolean
  automationMode: AutomationMode
  toolSurface: ToolSurface
  usagePolicy: UsagePolicy
  automationAssets: AutomationAssetPolicy
  /** Live view of the `prompts` overrides: `current()` reads the configuration at call time. */
  prompts: PromptsSource
  autoInstall: boolean
  snapshotDir: string
  downloadDir: string
  downloadMaxBytes: number
  allowPrivateHosts: boolean
  /** `$DSH_HOME/data/browser`: where the plugin keeps the policy overlay and its auth state directory. */
  dataDir: string
  /** The only directory an agent-set storageStatePath may live in. */
  authDir: string
  /** The managed policy overlay file (see policy-overlay.ts). */
  policyOverlayFile: string
  /** Context options applied to every context the plugin creates (viewport, user agent, locale, time zone, proxy). */
  contextDefaults: ContextOptions
  /** Settings that were read but have no effect, shown in `runtime.status`. */
  configWarnings: string[]
  verbose: boolean
  cdpPort?: number
  args: string[]
  maxSessions: number
}

/**
 * Where each nested spelling people try belongs, for the error that replaces silently ignoring it. These names are
 * in the schema only so schema parsing keeps them long enough for `resolveConfig` to refuse them; they are not settings.
 */
const MISPLACED_KEYS: Record<string, string> = {
  viewport: 'viewportMode (window | 720p | 1080p | custom), viewportWidth and viewportHeight',
  proxy: 'proxyServer and proxyBypass (flat keys; proxy accounts are not supported)',
  contextOptions: 'the flat keys viewportMode, viewportWidth, viewportHeight, userAgent, locale, timezoneId, proxyServer, proxyBypass',
  download: 'downloadDir and downloadMaxBytes',
  downloads: 'downloadDir and downloadMaxBytes',
}

export function defaultSnapshotDir(): string {
  const home = process.env.DSH_HOME ?? path.join(os.homedir(), '.dsh')
  return path.join(home, 'data', 'browser', 'snapshots')
}

export function defaultBrowserDataDir(): string {
  const home = process.env.DSH_HOME ?? path.join(os.homedir(), '.dsh')
  return path.join(home, 'data', 'browser')
}

export function defaultDownloadDir(): string {
  const home = process.env.DSH_HOME ?? path.join(os.homedir(), '.dsh')
  return path.join(home, 'data', 'browser', 'downloads')
}

/**
 * `downloadDir` must be an absolute path: a relative one would depend on the host process's working directory.
 * A wrong value falls back to the default and is reported, never thrown: see {@link resolveConfig}.
 */
export function resolveDownloadDir(value: unknown): { dir: string; warning?: string } {
  if (value === undefined || value === null || value === '') return { dir: defaultDownloadDir() }
  const problem = (reason: string) => ({ dir: defaultDownloadDir(), warning: configProblem('downloadDir', value, reason, `the default ${defaultDownloadDir()} is used`, 'give an absolute directory path, or clear the field') })
  if (typeof value !== 'string') return problem('it is not a string')
  try { checkAbsoluteDirectory(value, 'downloadDir', message => { throw new Error(message) }) } catch (error) { return problem((error as Error).message) }
  if (!path.isAbsolute(value)) return problem('it is not an absolute path on this system')
  return { dir: path.normalize(value) }
}

export function resolveDownloadMaxBytes(value: unknown): { bytes: number; warning?: string } {
  if (value === undefined || value === null) return { bytes: DEFAULT_DOWNLOAD_MAX_BYTES }
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > MAX_DOWNLOAD_BYTES_LIMIT) {
    return { bytes: DEFAULT_DOWNLOAD_MAX_BYTES, warning: configProblem('downloadMaxBytes', value, `it must be an integer from 1 to ${MAX_DOWNLOAD_BYTES_LIMIT}`, `the default ${DEFAULT_DOWNLOAD_MAX_BYTES} bytes (100 MiB) is used`, 'enter a whole number of bytes, or clear the field') }
  }
  return { bytes: value }
}

/**
 * The shared volatile-reference brand (`cosmokit`'s `Symbol.for` key). Detected
 * through the global symbol rather than by importing cosmokit: it is a
 * transitive dependency of schemastery and is not always hoisted, while the
 * symbol identity is guaranteed across ESM/CJS copies of the library.
 */
const VOLATILE_WRITE = Symbol.for('cosmokit.volatile.write')

/** Whether a resolved config field is a live volatile reference. */
function isVolatileRef(value: unknown): value is { get(): unknown } {
  return typeof value === 'object' && value !== null && VOLATILE_WRITE in value
}

/**
 * Read a config field as a plain value.
 *
 * A `.volatile()` field resolves to a live handle rather than a value, so it
 * must be unwrapped with `.get()` before any consumer that expects data.
 */
function plain<T>(value: T | undefined): T | undefined {
  return isVolatileRef(value) ? value.get() as T : value
}

export function resolveConfig(config: Config): ResolvedConfig {
  // Normalize every field at this one boundary, so nothing downstream — the
  // router, the tools, or the settings page's own baseline — ever sees a handle.
  const c = config as unknown as Record<string, unknown>
  const read = <T>(field: string, fallback: T): T => {
    const value = plain(c[field] as T | undefined)
    return value === undefined ? fallback : value
  }
  const optional = <T>(field: string): T | undefined => plain(c[field] as T | undefined)
  const snapshotDir = optional<string>('snapshotDir') ?? defaultSnapshotDir()
  // Nothing below throws for the settings added in 0.2.2: a plugin that fails to load takes its settings card with it,
  // so a value that cannot be used falls back to its default and is reported through `configWarnings` instead.
  const warnings: string[] = []
  for (const [key, instead] of Object.entries(MISPLACED_KEYS)) {
    const value = optional<unknown>(key)
    if (value !== undefined) warnings.push(`config "${key}" is not a setting and was ignored; use ${instead}`)
  }
  const downloadDir = resolveDownloadDir(optional('downloadDir'))
  const downloadMax = resolveDownloadMaxBytes(optional('downloadMaxBytes'))
  warnings.push(...[downloadDir.warning, downloadMax.warning].filter((warning): warning is string => !!warning))
  const context = resolveContextDefaults({
    viewportMode: optional('viewportMode'),
    viewportWidth: optional('viewportWidth'),
    viewportHeight: optional('viewportHeight'),
    userAgent: optional('userAgent'),
    locale: optional('locale'),
    timezoneId: optional('timezoneId'),
    proxyServer: optional('proxyServer'),
    proxyBypass: optional('proxyBypass'),
  })
  return {
    enabled: read('enabled', true),
    channel: read('channel', 'chromium'),
    browserRuntime: resolveBrowserRuntime(plain(c.browserRuntime)),
    headless: read('headless', true),
    opencliEnabled: read('opencliEnabled', true),
    automationMode: resolveAutomationMode(optional<string>('automationMode')),
    toolSurface: resolveToolSurface(optional<string>('toolSurface')),
    usagePolicy: resolveUsagePolicy(optional<Partial<UsagePolicyInput>>('usagePolicy')),
    automationAssets: resolveAutomationAssetPolicy(optional<Partial<AutomationAssetPolicyInput>>('automationAssets')),
    // Kept as a live reader, not a snapshot: the volatile handle is updated in place when the setting changes.
    prompts: promptsSource(() => plain(c.prompts)),
    autoInstall: read('autoInstall', false),
    maxSessions: read('maxSessions', 8),
    snapshotDir,
    downloadDir: downloadDir.dir,
    downloadMaxBytes: downloadMax.bytes,
    allowPrivateHosts: read('allowPrivateHosts', false),
    // `browserDataDir` is not a setting (the schema drops it): it is how tests and embedders that hand `resolveConfig`
    // a plain object keep the overlay out of the real DSH_HOME.
    ...(() => {
      const dataDir = optional<string>('browserDataDir') ?? defaultBrowserDataDir()
      return { dataDir, authDir: path.join(dataDir, 'auth'), policyOverlayFile: path.join(dataDir, 'policy-overlay.json') }
    })(),
    contextDefaults: context.options,
    configWarnings: [...warnings, ...context.warnings],
    verbose: read('verbose', false),
    authProfiles: read('authProfiles', {}),
    rulePacks: read('rulePacks', {}),
    args: Array.isArray(plain(c.args)) ? (plain(c.args) as string[]).map(String) : [],
    ...optional<number>('cdpPort') !== undefined ? { cdpPort: optional<number>('cdpPort') } : {},
    ...optional<string>('defaultAuthProfile') ? { defaultAuthProfile: optional<string>('defaultAuthProfile') } : {},
    ...optional<string>('storageStatePath') ? { storageStatePath: optional<string>('storageStatePath') } : {},
    ...optional<string>('executablePath') ? { executablePath: optional<string>('executablePath') } : {},
  }
}
