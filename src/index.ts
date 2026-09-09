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
import type {} from '@deepseek-ai/dsh-settings'
import { Config, resolveConfig, type ResolvedConfig } from './config.ts'
import { BrowserService } from './browser-service.ts'
import { registerTools } from './tools.ts'
import { browserPolicyDecision } from './approval-policy.ts'
import { AutomationAssetStore } from './automation-assets.ts'
import { registerAutomationAssetRpc } from './automation-assets-rpc.ts'

export const name = 'dsh-browser'
export const inject = ['tools']

export { Config }
export type { Config as BrowserConfig } from './config.ts'
export type { BrowserService, RenderRule, RenderResult, SnapshotResult, PlatformSpec, SearchItem, InteractiveState, RecipeRunResult, ScriptRunResult, EvaluateResult, FileUploadResult } from './browser-service.ts'
export type { AuthProfileConfig, ResolvedAuthProfile } from './auth-profiles.ts'
export type { RulePackConfig, RuleStep, ResolvedRulePack } from './rule-packs.ts'
export type { BrowserRecipeStep, RecipeStepResult } from './automation.ts'
export type { UserscriptMetadata, UserscriptValidation, BuiltinScript } from './scripts.ts'
export { BUILTIN_SCRIPTS, validateUserscript } from './scripts.ts'
export type { AutomationMode, BrowserToolName } from './freedom.ts'
export { AUTOMATION_MODES, ALL_BROWSER_TOOL_NAMES, browserToolsForMode, configuredBrowserTools } from './freedom.ts'
export type { AutomationAssetPolicy, AutomationAssetPolicyInput, AutomationAsset, AutomationAssetSummary, AutomationCandidate, AutomationCandidateSummary, AssetPersistenceMode, AssetActivationMode } from './automation-assets.ts'
export { ASSET_PERSISTENCE_MODES, ASSET_ACTIVATION_MODES, resolveAutomationAssetPolicy, AutomationAssetStore } from './automation-assets.ts'

export function apply(ctx: Context, config: Config): void {
  const deployed: ResolvedConfig = resolveConfig(config)
  let resolveSource: () => Config = () => deployed
  ctx.inject(['settings'], (settingsCtx) => {
    const settings = settingsCtx.settings as unknown as {
      register?: (
        ns: string,
        schema: typeof Config,
        options?: { base?: ResolvedConfig; applies?: string },
      ) => { get: () => Config }
    }
    if (typeof settings?.register === 'function') {
      const scope = settings.register('browser', Config, {
        base: deployed,
        // Browser processes, tool exposure, and approval hooks are deliberately
        // startup-scoped. The next full profile start reads the persisted layer.
        applies: 'restart',
      })
      resolveSource = () => scope.get()
    }
  })
  const resolved: ResolvedConfig = resolveConfig(resolveSource())
  fs.mkdirSync(resolved.snapshotDir, { recursive: true })

  const service = new BrowserService(resolved)
  const assets = new AutomationAssetStore(resolved.automationAssets)

  // Apply the configured exposure/approval mode before every browser tool.
  // Validation remains active even when unrestricted mode skips approvals.
  ctx.on('tools/pre-execute', async (exec, next) => {
    const downstream = await next()
    if (downstream.kind !== 'allow') return downstream
    return browserPolicyDecision(exec.name, exec.arguments, resolved.automationMode)
  })

  // Provide the `browser` service so consumers (web-search-pro) can inject it.
  // ctx.provide is scoped to this plugin's fiber; the browser instance itself
  // is closed via the effect disposer below.
  ctx.provide('browser', service)
  ctx.effect(() => () => void service.close())

  registerTools(ctx, resolved, service, assets)
  registerAutomationAssetRpc(ctx, assets, service)

  if (resolved.verbose) {
    try {
      const markerPath = path.join(resolved.snapshotDir, 'apply.log')
      fs.appendFileSync(markerPath, JSON.stringify({
        ts: new Date().toISOString(),
        plugin: name,
        channel: resolved.channel,
        headless: resolved.headless,
        opencliEnabled: resolved.opencliEnabled,
        automationMode: resolved.automationMode,
        snapshotDir: resolved.snapshotDir,
      }) + '\n', 'utf8')
    } catch { /* marker is best-effort */ }
  }

  ctx.logger?.(name).info('dsh-browser loaded: channel=' + resolved.channel + ' headless=' + resolved.headless + ' opencli=' + resolved.opencliEnabled + ' automation=' + resolved.automationMode)
}
