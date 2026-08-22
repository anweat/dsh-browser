/**
 * dsh-browser — self-contained browser runtime plugin for DeepSeek Harness.
 *
 * Bundles Playwright (chromium) + OpenCLI as plugin-local npm dependencies and
 * provides a `browser` service for other plugins (web-search-pro injects it),
 * plus model-facing interactive browser tools.
 * @module dsh-browser
 */

import type { Context } from '@deepseek-ai/cordis'
import fs from 'node:fs'
import path from 'node:path'
import type {} from '@deepseek-ai/dsh-tools'
import { Config, resolveConfig, type ResolvedConfig } from './config.ts'
import { BrowserService } from './browser-service.ts'
import { registerTools } from './tools.ts'

export const name = 'dsh-browser'
export const inject = ['tools']

export { Config }
export type { Config as BrowserConfig } from './config.ts'
export type { BrowserService, RenderRule, RenderResult, SnapshotResult, PlatformSpec, SearchItem, InteractiveState } from './browser-service.ts'
export type { AuthProfileConfig, ResolvedAuthProfile } from './auth-profiles.ts'
export type { RulePackConfig, RuleStep, ResolvedRulePack } from './rule-packs.ts'

export function apply(ctx: Context, config: Config): void {
  const resolved: ResolvedConfig = resolveConfig(config)
  fs.mkdirSync(resolved.snapshotDir, { recursive: true })

  const service = new BrowserService(resolved)

  // Provide the `browser` service so consumers (web-search-pro) can inject it.
  // ctx.provide is scoped to this plugin's fiber; the browser instance itself
  // is closed via the effect disposer below.
  ctx.provide('browser', service)
  ctx.effect(() => () => void service.close())

  registerTools(ctx, resolved, service)

  if (resolved.verbose) {
    try {
      const markerPath = path.join(resolved.snapshotDir, 'apply.log')
      fs.appendFileSync(markerPath, JSON.stringify({
        ts: new Date().toISOString(),
        plugin: name,
        channel: resolved.channel,
        headless: resolved.headless,
        opencliEnabled: resolved.opencliEnabled,
        snapshotDir: resolved.snapshotDir,
      }) + '\n', 'utf8')
    } catch { /* marker is best-effort */ }
  }

  ctx.logger?.(name).info('dsh-browser loaded: channel=' + resolved.channel + ' headless=' + resolved.headless + ' opencli=' + resolved.opencliEnabled)
}
