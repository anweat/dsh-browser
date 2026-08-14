/**
 * dsh-browser plugin configuration (schemastery) and the resolved runtime shape.
 * @module dsh-browser/config
 */

import path from 'node:path'
import os from 'node:os'
import z from '@deepseek-ai/schemastery'

export interface Config {
  /** Whether the browser service is active. */
  enabled: boolean
  /** Browser channel: 'chromium' (bundled, self-contained) or 'msedge'. */
  channel: string
  headless: boolean
  /** Path to a Playwright storageState JSON (persisted login state). */
  storageStatePath?: string
  /** Explicit browser executable path override (rare). */
  executablePath?: string
  /** Whether the bundled OpenCLI is enabled. */
  opencliEnabled: boolean
  /** Lazily run `playwright install chromium` when the browser is missing. */
  autoInstall: boolean
  /** Directory for browser screenshots; defaults to $DSH_HOME/data/browser/snapshots. */
  snapshotDir?: string
  verbose: boolean
}

export const Config: z<Config> = z.object({
  enabled: z.boolean().default(true),
  channel: z.string().default('chromium'),
  headless: z.boolean().default(true),
  storageStatePath: z.string(),
  executablePath: z.string(),
  opencliEnabled: z.boolean().default(true),
  autoInstall: z.boolean().default(false),
  snapshotDir: z.string(),
  verbose: z.boolean().default(false),
})

export interface ResolvedConfig {
  enabled: boolean
  channel: string
  headless: boolean
  storageStatePath?: string
  executablePath?: string
  opencliEnabled: boolean
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
    headless: config.headless ?? true,
    opencliEnabled: config.opencliEnabled ?? true,
    autoInstall: config.autoInstall ?? false,
    snapshotDir,
    verbose: config.verbose ?? false,
    ...config.storageStatePath !== undefined && config.storageStatePath !== '' ? { storageStatePath: config.storageStatePath } : {},
    ...config.executablePath !== undefined && config.executablePath !== '' ? { executablePath: config.executablePath } : {},
  }
}
