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
import { resolveBrowserCall } from './actions/surface.ts'
import { registerSkillWhenAvailable } from './skill.ts'
import { installErrorHints } from './actions/errors.ts'
import { describePrompts } from './prompts.ts'
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
export type { BrowserService, RenderRule, RenderResult, SnapshotResult, PlatformSpec, SearchItem, InteractiveState, RecipeServiceResult, ScriptRunResult, EvaluateResult, FileUploadResult } from './browser-service.ts'
export type { AuthProfileConfig, ResolvedAuthProfile } from './auth-profiles.ts'
export type { RulePackConfig, RuleStep, ResolvedRulePack } from './rule-packs.ts'
export type { BrowserRecipeStep, RecipeStepResult, RecipeRunResult, RecipeExecutionStatus, RecipeValidationStatus, RecipeEffects, RecipeFailedStep, RecipeOutput } from './automation.ts'
export type { UserscriptMetadata, UserscriptValidation, BuiltinScript } from './scripts.ts'
export { BUILTIN_SCRIPTS, validateUserscript } from './scripts.ts'
export type { AutomationMode, ToolSurface, BrowserActionName } from './freedom.ts'
export { AUTOMATION_MODES, TOOL_SURFACES, ALL_BROWSER_ACTION_NAMES, browserActionsForMode, configuredBrowserActions, configuredBrowserTools } from './freedom.ts'
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

  // Apply the configured exposure/approval mode before every browser call.
  // Approval is decided per ACTION: browser_call (and each flat tool) is
  // resolved to its action and arguments first, so the user is asked about
  // `act.click #submit`, not about a generic dispatcher. browser_index only
  // reads the catalog and is let through. Validation remains active even when
  // unrestricted mode skips approvals.
  ctx.on('tools/pre-execute', async (exec, next) => {
    const downstream = await next()
    if (downstream.kind !== 'allow') return downstream
    const call = resolveBrowserCall(exec.name, exec.arguments)
    // `unresolved` is a browser_call naming no known action: it runs no
    // action and returns a structured UNKNOWN_ACTION error, so nothing to approve.
    if (call?.kind === 'index' || call?.kind === 'unresolved') return downstream
    if (call?.kind === 'action') {
      // automation.run and automation.develop test act on a stored asset: the policy needs to know what kind it is,
      // and for a recipe draft which steps it would replay.
      const callArgs = (call.args ?? {}) as { id?: unknown; action?: unknown }
      const replaysAsset = call.action === 'automation.run' || (call.action === 'automation.develop' && callArgs.action === 'test')
      const target = replaysAsset && typeof callArgs.id === 'string' ? assets.get(callArgs.id) : undefined
      return browserPolicyDecision(call.action, call.args, resolved.automationMode, target?.kind, call.action === 'automation.develop' ? target?.recipe : undefined)
    }
    return browserPolicyDecision(exec.name, exec.arguments, resolved.automationMode)
  })

  // Provide the `browser` service so consumers (web-search-pro) can inject it.
  // ctx.provide is scoped to this plugin's fiber; the browser instance itself
  // is closed via the effect disposer below.
  ctx.provide('browser', service)
  ctx.effect(() => () => void service.close())

  // Optional: the `dsh-browser` skill is registered only when the Host has a
  // skill registry. It must not be a declared `inject` (Cordis 4.0.4 would
  // hang the plugin without it); this opens a scoped, optional dependency.
  // `prompts.skill` is read live: the skill is registered, withdrawn or invalidated when it changes.
  const skill = registerSkillWhenAvailable(ctx, undefined, resolved.prompts)

  // `prompts.errorHints` replace the by-code hints wherever an error is built; read per call.
  ctx.effect(() => installErrorHints(() => resolved.prompts.current().errorHints))

  registerTools(ctx, resolved, service, assets, { skillAvailable: skill.isAvailable, refreshSkill: skill.refresh })
  registerAutomationAssetRpc(ctx, assets, service, () => describePrompts({ prompts: resolved.prompts, mode: resolved.automationMode, options: resolved.automationAssets, enabled: resolved.enabled }))

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
        toolSurface: resolved.toolSurface,
        snapshotDir: resolved.snapshotDir,
      }) + '\n', 'utf8')
    } catch { /* marker is best-effort */ }
  }

  ctx.logger?.(name).info('dsh-browser loaded: channel=' + resolved.channel + ' headless=' + resolved.headless + ' opencli=' + resolved.opencliEnabled + ' automation=' + resolved.automationMode + ' surface=' + resolved.toolSurface)
}
