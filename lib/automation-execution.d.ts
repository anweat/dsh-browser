/** Shared guarded execution for active assets and draft runtime replay. */
import type { AutomationAsset, AutomationAssetStore } from './automation-assets.ts';
import type { BrowserService } from './browser-service.ts';
export interface AutomationExecutionOptions {
    signal?: AbortSignal;
    authProfile?: string;
    rulePack?: string;
}
export interface AutomationExecutionResult {
    asset: AutomationAsset;
    value: unknown;
}
export declare function automationInputs(asset: AutomationAsset, raw: unknown): Record<string, string>;
export declare function executeAutomationAsset(service: BrowserService, store: AutomationAssetStore, id: string, url: string, rawInputs: unknown, requiredStatus: 'active' | 'draft', options?: AutomationExecutionOptions): Promise<AutomationExecutionResult>;
