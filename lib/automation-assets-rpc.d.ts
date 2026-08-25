/** Loopback-only Host RPC for the automation asset review UI. */
import type { Context } from '@deepseek-ai/cordis';
import type { AutomationAssetStore } from './automation-assets.ts';
import type { BrowserService } from './browser-service.ts';
export declare function registerAutomationAssetRpc(ctx: Context, store: AutomationAssetStore, service: BrowserService): void;
