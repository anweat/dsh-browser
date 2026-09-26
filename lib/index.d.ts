/**
 * dsh-browser — self-contained browser runtime plugin for DeepSeek Harness.
 *
 * Bundles Playwright (chromium) + OpenCLI as plugin-local npm dependencies and
 * provides a `browser` service for other plugins (web-search-pro injects it),
 * plus model-facing interactive browser tools.
 * @module dsh-browser
 */
import type { Context } from '@deepseek-ai/cordis';
import { Config } from './config.ts';
export declare const name = "dsh-browser";
export declare const inject: string[];
/**
 * Loader entry id of this plugin's row in `cordis.patch.yml`, which is also the
 * settings namespace the plugin owns. On hosts whose `SettingsForms` still
 * exposes `register()` this is the scope namespace; on newer hosts it is the
 * profile patch entry id whose `Config` schema the settings page is derived
 * from. Keep it in sync with the bundle patch.
 */
export declare const BROWSER_SETTINGS_NS = "browser";
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
declare const plugin: {
    name: string;
    inject: readonly ["tools", "settings"];
    apply: typeof apply;
    Config: import("@deepseek-ai/schemastery").default<Config>;
};
export default plugin;
export { Config };
export type { Config as BrowserConfig } from './config.ts';
export type { BrowserService, RenderRule, RenderResult, SnapshotResult, PlatformSpec, SearchItem, InteractiveState, RecipeRunResult, ScriptRunResult, EvaluateResult, FileUploadResult } from './browser-service.ts';
export type { AuthProfileConfig, ResolvedAuthProfile } from './auth-profiles.ts';
export type { RulePackConfig, RuleStep, ResolvedRulePack } from './rule-packs.ts';
export type { BrowserRecipeStep, RecipeStepResult } from './automation.ts';
export type { UserscriptMetadata, UserscriptValidation, BuiltinScript } from './scripts.ts';
export { BUILTIN_SCRIPTS, validateUserscript } from './scripts.ts';
export type { AutomationMode, BrowserToolName } from './freedom.ts';
export { AUTOMATION_MODES, ALL_BROWSER_TOOL_NAMES, browserToolsForMode, configuredBrowserTools } from './freedom.ts';
export type { AutomationAssetPolicy, AutomationAssetPolicyInput, AutomationAsset, AutomationAssetSummary, AutomationCandidate, AutomationCandidateSummary, AssetPersistenceMode, AssetActivationMode } from './automation-assets.ts';
export { ASSET_PERSISTENCE_MODES, ASSET_ACTIVATION_MODES, resolveAutomationAssetPolicy, AutomationAssetStore } from './automation-assets.ts';
export declare function apply(ctx: Context, config: Config): void;
