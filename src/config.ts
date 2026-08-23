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
}

export const Config: z<Config> = z.object({
  enabled: z.boolean().default(true),
  channel: z.string().default('chromium'),
  browserRuntime: z.string().default('playwright'),
  headless: z.boolean().default(true),
  storageStatePath: z.string(),
  authProfiles: z.dict(z.object({
    storageStatePath: z.string(),
    allowedDomains: z.array(z.string()).default([]),
    persistState: z.boolean().default(false),
  })),
  defaultAuthProfile: z.string(),
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
  executablePath: z.string(),
  opencliEnabled: z.boolean().default(true),
  automationMode: z.string().default('standard'),
  usagePolicy: z.object({
    minDelayMs: z.number().default(750),
    maxConcurrency: z.number().default(2),
    burst: z.number().default(3),
    maxPagesPerRun: z.number().default(20),
    maxDepth: z.number().default(2),
    retryLimit: z.number().default(2),
    backoffBaseMs: z.number().default(1000),
    cooldownMs: z.number().default(30000),
  }),
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
  }),
  autoInstall: z.boolean().default(false),
  snapshotDir: z.string(),
  verbose: z.boolean().default(false),
}) as z<Config>

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
}

export function defaultSnapshotDir(): string {
  const home = process.env.DSH_HOME ?? path.join(os.homedir(), '.dsh')
  return path.join(home, 'data', 'browser', 'snapshots')
}

export function resolveConfig(config: Config): ResolvedConfig {
  const snapshotDir = config.snapshotDir ?? defaultSnapshotDir()
  return {
    enabled: config.enabled ?? true,
    channel: config.channel ?? 'chromium',
    browserRuntime: resolveBrowserRuntime(config.browserRuntime),
    headless: config.headless ?? true,
    opencliEnabled: config.opencliEnabled ?? true,
    automationMode: resolveAutomationMode(config.automationMode),
    usagePolicy: resolveUsagePolicy(config.usagePolicy),
    automationAssets: resolveAutomationAssetPolicy(config.automationAssets),
    autoInstall: config.autoInstall ?? false,
    snapshotDir,
    verbose: config.verbose ?? false,
    authProfiles: config.authProfiles ?? {},
    rulePacks: config.rulePacks ?? {},
    ...config.defaultAuthProfile ? { defaultAuthProfile: config.defaultAuthProfile } : {},
    ...config.storageStatePath !== undefined && config.storageStatePath !== '' ? { storageStatePath: config.storageStatePath } : {},
    ...config.executablePath !== undefined && config.executablePath !== '' ? { executablePath: config.executablePath } : {},
  }
}
