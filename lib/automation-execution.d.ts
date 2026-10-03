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
    /** Run a recipe in a brand-new BrowserContext instead of the session's page (UserScripts already run in their own). */
    isolated?: boolean;
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
/** How many input sets one test takes. */
export declare const INPUT_SET_MIN = 2;
export declare const INPUT_SET_MAX = 5;
export declare const PARAMETERIZATION_SUSPECT = "PARAMETERIZATION_SUSPECT";
export interface InputSetResult {
    index: number;
    /** Truncated sha256 of this set's canonical inputs (the values are never stored). */
    inputsDigest: string;
    passed: boolean;
    execution: AutomationExecution;
    /** The named outputs of a recipe (or the UserScript result), the thing that must change when the input does. */
    produced: unknown;
    /** Digest of `produced`, to compare sets without keeping them. */
    outputsDigest: string;
}
export interface InputSetsExecutionResult {
    asset: AutomationAsset;
    succeeded: boolean;
    /** One entry per set that ran; a failing set stops the test, so later sets may be missing (`planned` says how many were asked for). */
    sets: InputSetResult[];
    planned: number;
    verifierMissing?: {
        message: string;
    };
    /** Sets whose different inputs produced the same outputs: the parameterization may only be cosmetic. */
    identicalOutputs: number[][];
    suspect: boolean;
}
/**
 * Test a draft with 2 to 5 input sets, each in its own fresh BrowserContext, never in the session's page.
 * Every set must pass for the test to pass. A passing test is only suspicious (not failed) when different
 * inputs gave identical outputs; the credential then carries `PARAMETERIZATION_SUSPECT`.
 */
export declare function executeDraftInputSets(service: BrowserService, store: AutomationAssetStore, id: string, url: string, rawSets: unknown, options?: AutomationExecutionOptions): Promise<InputSetsExecutionResult>;
