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
import { browserPolicyDecision } from './approval-policy.ts'
import { resolveBrowserCall } from './actions/surface.ts'
import { registerSkillWhenAvailable } from './skill.ts'
import { installErrorHints } from './actions/errors.ts'
import { describePrompts } from './prompts.ts'
import { AutomationAssetStore } from './automation-assets.ts'
import { registerAutomationAssetRpc } from './automation-assets-rpc.ts'

export const name = 'dsh-browser'
// Only `tools` is required: `apply` registers the model-facing tools there. `settings` is deliberately NOT declared:
// Cordis 4.0.4 treats every declared inject as required, so a Host composition without the Settings service
// (sdk-minimal, a profile with that row switched off) would leave the plugin pending forever. Nothing here reads
// `ctx.settings`; `apply` takes its config from the Loader entry. Without the Settings service the plugin runs with
// its Config defaults and the settings card is simply not served (the client mounts it only while the Host serves
// the `browser` namespace, see `src/client/index.ts`).
export const inject = ['tools']

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
const plugin = { name: 'dsh-browser', inject, apply, Config }
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
  // `config` is the Loader entry's own `Config` (entry id `browser` in `cordis.patch.yml`, the same id the
  // client settings card binds to); the Host derives the settings page from that schema. Every field that
  // page edits is `.volatile()`, so a save commits the new value into the running references and emits
  // `loader/volatile-update` without remounting this plugin. Browser processes, tool exposure and approval
  // hooks are deliberately startup-scoped: `resolveConfig` reads them once here, so a saved value applies
  // when the profile restarts. Only `prompts` is read live (see `ResolvedConfig.prompts`).
  const resolved: ResolvedConfig = resolveConfig(config)
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
      return browserPolicyDecision(call.action, call.args, resolved.automationMode, target?.kind, call.action === 'automation.develop' ? target?.recipe : undefined, target ? { id: target.id, name: target.name, revision: target.revision } : undefined)
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
