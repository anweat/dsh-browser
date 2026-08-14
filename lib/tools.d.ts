/**
 * Model-facing browser tools for dsh-browser: an interactive, multi-step
 * browser over a persistent page (open/click/type/scroll/read/screenshot/close)
 * plus status and chromium-install helpers.
 * @module dsh-browser/tools
 */
import type { Context } from '@deepseek-ai/cordis';
import type { ResolvedConfig } from './config.ts';
import type { BrowserService } from './browser-service.ts';
export declare function registerTools(ctx: Context, config: ResolvedConfig, service: BrowserService): void;
