/** Shared guarded execution for active assets and draft runtime replay. */
import type { RecipeRunResult } from './automation.ts';
import { type AutomationAsset, type AutomationAssetStore, type EvidenceLevel } from './automation-assets.ts';
import type { BrowserService } from './browser-service.ts';
export interface AutomationExecutionOptions {
    signal?: AbortSignal;
    authProfile?: string;
    rulePack?: string;
    /** Session key, so an asset run uses the calling session's page bucket. */
    session?: string;
    /** Draft tests: refuse to run unless the asset is still at this revision (what the caller saved and looked at). */
    expectedRevision?: number;
}
/** What one run did, in the same shape for recipes and UserScripts, plus how strongly it was checked. */
export interface AutomationExecution extends RecipeRunResult {
    /** `verified` only when this run passed at least one assert and none failed; otherwise `legacy-unverified`. */
    evidenceLevel: EvidenceLevel;
}
export interface AutomationExecutionResult {
    asset: AutomationAsset;
    /** Page state after a recipe, or the UserScript output. Never carries the run fields. */
    value: unknown;
    execution: AutomationExecution;
    /** The run completed and no assertion failed. Only this counts as a passed test or a successful run. */
    succeeded: boolean;
    /**
     * Set when the steps ran cleanly but the test still cannot pass because nothing verifies the result
     * (a v2 recipe with no assert step and no postcondition). The run is a failed test, not a success.
     */
    verifierMissing?: {
        message: string;
    };
}
export declare function automationInputs(asset: AutomationAsset, raw: unknown): Record<string, string>;
export declare function executeAutomationAsset(service: BrowserService, store: AutomationAssetStore, id: string, url: string, rawInputs: unknown, requiredStatus: 'active' | 'draft', options?: AutomationExecutionOptions): Promise<AutomationExecutionResult>;
