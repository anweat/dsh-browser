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
export type { BrowserService, RenderRule, RenderResult, SnapshotResult, PlatformSpec, SearchItem, InteractiveState } from './browser-service.ts';
export type { AuthProfileConfig, ResolvedAuthProfile } from './auth-profiles.ts';
export type { RulePackConfig, RuleStep, ResolvedRulePack } from './rule-packs.ts';
export declare function apply(ctx: Context, config: Config): void;
