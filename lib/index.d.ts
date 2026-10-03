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
    inject: string[];
    apply: typeof apply;
    Config: import("@deepseek-ai/schemastery").default<Config>;
};
export default plugin;
export { Config };
export type { Config as BrowserConfig } from './config.ts';
export type { BrowserService, RenderRule, RenderResult, SnapshotResult, PlatformSpec, SearchItem, InteractiveState, RecipeServiceResult, ScriptRunResult, EvaluateResult, FileUploadResult } from './browser-service.ts';
export type { AuthProfileConfig, ResolvedAuthProfile } from './auth-profiles.ts';
export type { RulePackConfig, RuleStep, ResolvedRulePack } from './rule-packs.ts';
export type { BrowserRecipeStep, RecipeStepResult, RecipeRunResult, RecipeExecutionStatus, RecipeValidationStatus, RecipeEffects, RecipeFailedStep, RecipeOutput } from './automation.ts';
export type { UserscriptMetadata, UserscriptValidation, BuiltinScript } from './scripts.ts';
export { BUILTIN_SCRIPTS, validateUserscript } from './scripts.ts';
export type { AutomationMode, ToolSurface, BrowserActionName } from './freedom.ts';
export { AUTOMATION_MODES, TOOL_SURFACES, ALL_BROWSER_ACTION_NAMES, browserActionsForMode, configuredBrowserActions, configuredBrowserTools } from './freedom.ts';
export type { AutomationAssetPolicy, AutomationAssetPolicyInput, AutomationAsset, AutomationAssetSummary, AutomationCandidate, AutomationCandidateSummary, AssetPersistenceMode, AssetActivationMode } from './automation-assets.ts';
export { ASSET_PERSISTENCE_MODES, ASSET_ACTIVATION_MODES, resolveAutomationAssetPolicy, AutomationAssetStore } from './automation-assets.ts';
export declare function apply(ctx: Context, config: Config): void;
