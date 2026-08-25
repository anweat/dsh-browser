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
export { Config };
export type { Config as BrowserConfig } from './config.ts';
export type { BrowserService, RenderRule, RenderResult, SnapshotResult, PlatformSpec, SearchItem, InteractiveState, RecipeRunResult, ScriptRunResult } from './browser-service.ts';
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
