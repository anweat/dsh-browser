/** Loopback-only Host RPC for the automation asset review UI. */
import type { Context } from '@deepseek-ai/cordis';
import { type AutomationAssetStore } from './automation-assets.ts';
import type { BrowserService } from './browser-service.ts';
/** A failure the review UI should tell apart from a transport or storage error. `details.errorCode` names it. */
export declare class AssetRpcFailure extends Error {
    readonly details: Record<string, unknown>;
    constructor(message: string, details: Record<string, unknown>);
}
/** `promptsStatus` answers the settings card's "prompt text" section: the overrides in force, diagnostics and the L0 estimate. */
export declare function registerAutomationAssetRpc(ctx: Context, store: AutomationAssetStore, service: BrowserService, promptsStatus?: () => unknown): void;
