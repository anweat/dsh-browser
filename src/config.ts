/**
 * dsh-browser plugin configuration (schemastery) and the resolved runtime shape.
 * @module dsh-browser/config
 */

import path from 'node:path'
import os from 'node:os'
import z from '@deepseek-ai/schemastery'
import type { AuthProfileConfig } from './auth-profiles.ts'
import type { RulePackConfig } from './rule-packs.ts'
import { resolveAutomationMode, type AutomationMode } from './freedom.ts'
import { resolveUsagePolicy, type UsagePolicy, type UsagePolicyInput } from './usage-policy.ts'
import { resolveAutomationAssetPolicy, type AutomationAssetPolicy, type AutomationAssetPolicyInput } from './automation-assets.ts'

export const BROWSER_RUNTIMES = ['playwright', 'patchright'] as const
export type BrowserRuntime = typeof BROWSER_RUNTIMES[number]

export function resolveBrowserRuntime(value: unknown): BrowserRuntime {
  const runtime = value ?? 'playwright'
  if (typeof runtime !== 'string' || !BROWSER_RUNTIMES.includes(runtime as BrowserRuntime)) {
    throw new Error('browserRuntime must be one of: ' + BROWSER_RUNTIMES.join(', '))
  }
  return runtime as BrowserRuntime
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
  /** Approval-independent traffic buffering and bounded crawl budgets. */
  usagePolicy?: UsagePolicyInput
  /** Reusable automation capture, review, activation, and retrieval policy. */
  automationAssets?: AutomationAssetPolicyInput
  /** Lazily run `playwright install chromium` when the browser is missing. */
  autoInstall: boolean
  /** Directory for browser screenshots; defaults to $DSH_HOME/data/browser/snapshots. */
  snapshotDir?: string
  verbose: boolean
  /** Optional remote debugging port to expose CDP for external tools (e.g. 9222). */
  cdpPort?: number
  /** Additional Chromium CLI launch arguments. */
  args?: string[]
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
  }).volatile(),
  autoInstall: z.boolean().default(false).volatile(),
  snapshotDir: z.string().volatile(),
  verbose: z.boolean().default(false).volatile(),
  cdpPort: z.number().min(1).max(65_535).step(1).description('Optional remote debugging port to expose CDP for external tools (e.g. 9222)').volatile(),
  args: z.array(z.string()).default([]).description('Additional Chromium CLI launch arguments').volatile(),
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
  usagePolicy: UsagePolicy
  automationAssets: AutomationAssetPolicy
  autoInstall: boolean
  snapshotDir: string
  verbose: boolean
  cdpPort?: number
  args: string[]
}

export function defaultSnapshotDir(): string {
  const home = process.env.DSH_HOME ?? path.join(os.homedir(), '.dsh')
  return path.join(home, 'data', 'browser', 'snapshots')
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
  return {
    enabled: read('enabled', true),
    channel: read('channel', 'chromium'),
    browserRuntime: resolveBrowserRuntime(plain(c.browserRuntime)),
    headless: read('headless', true),
    opencliEnabled: read('opencliEnabled', true),
    automationMode: resolveAutomationMode(optional<string>('automationMode')),
    usagePolicy: resolveUsagePolicy(optional<Partial<UsagePolicyInput>>('usagePolicy')),
    automationAssets: resolveAutomationAssetPolicy(optional<Partial<AutomationAssetPolicyInput>>('automationAssets')),
    autoInstall: read('autoInstall', false),
    snapshotDir,
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
