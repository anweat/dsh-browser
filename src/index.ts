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
import { resolveSettingsScope } from './settings-scope.ts'
import { BrowserService } from './browser-service.ts'
import { registerTools } from './tools.ts'
import { browserPolicyDecision } from './approval-policy.ts'
import { AutomationAssetStore } from './automation-assets.ts'
import { registerAutomationAssetRpc } from './automation-assets-rpc.ts'

export const name = 'dsh-browser'
export const inject = ['tools', 'settings']

/**
 * Loader entry id of this plugin's row in `cordis.patch.yml`, which is also the
 * settings namespace the plugin owns. On hosts whose `SettingsForms` still
 * exposes `register()` this is the scope namespace; on newer hosts it is the
 * profile patch entry id whose `Config` schema the settings page is derived
 * from. Keep it in sync with the bundle patch.
 */
export const BROWSER_SETTINGS_NS = 'browser'

/**
 * The object cordis actually receives.
 *
 * `Loader.unwrapExports(exports)` normalizes a module to ONE plugin object via
 * `exports.default ?? exports`, and cordis caches its runtime as
 * `{ name, callback, fibers, Config: plugin.Config }` off THAT object. A module
 * whose only `Config` is a named export therefore loses its schema: the plugin
 * still runs, but no settings page can ever be derived from it, and nothing
 * reports the omission. Exporting the assembled object as `default` is what
 * makes `Config` visible to the settings service.
 */
const plugin = { name: 'dsh-browser', inject: ['tools', 'settings'] as const, apply, Config }
export default plugin

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
  // Browser processes, tool exposure, and approval hooks are deliberately
  // startup-scoped. On hosts that still ship the legacy `settings.register`
  // provider we register a live scope; on dsh-v0.1.7-rc.2+ — which removed it
  // and derives settings pages from this entry's own Config schema — the
  // Loader re-applies the validated entry config by restarting this fiber.
  // The namespace is the bundle patch's loader entry id (`browser`), which is
  // also what the client settings card binds to.
  const settingsScope = resolveSettingsScope<Config>(ctx.settings, BROWSER_SETTINGS_NS, Config, config)
  const resolved: ResolvedConfig = resolveConfig(settingsScope.get())
  fs.mkdirSync(resolved.snapshotDir, { recursive: true })

  const service = new BrowserService(resolved)
  const assets = new AutomationAssetStore(resolved.automationAssets)

  // Apply the configured exposure/approval mode before every browser tool.
  // Validation remains active even when unrestricted mode skips approvals.
  ctx.on('tools/pre-execute', async (exec, next) => {
    const downstream = await next()
    if (downstream.kind !== 'allow') return downstream
    const assetId = (exec.arguments as { id?: unknown })?.id
    const assetKind = exec.name === 'browser_automation_run' && typeof assetId === 'string'
      ? assets.get(assetId)?.kind : undefined
    return browserPolicyDecision(exec.name, exec.arguments, resolved.automationMode, assetKind)
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
