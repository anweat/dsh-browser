/** Helpers shared by the action group modules. @module dsh-browser/actions/shared */
import type { BrowserTarget } from '../browser-service.ts';
import type { RecipeRunResult } from '../automation.ts';
import { type ActionOutcome } from './types.ts';
export declare const COMPLIANCE_NOTICE = "The caller/operator must use this capability according to the target site rules and applicable requirements; dsh-browser only executes the requested browser operation and does not determine whether a particular use is permitted.";
/** Resolve the selector-or-locator pair every element-targeting action accepts. */
export declare function targetOf(args: {
    selector?: unknown;
    locator?: unknown;
}, required?: boolean): BrowserTarget | undefined;
/** The `expectGeneration` guard of an act.* call, ready to spread into the service options. */
export declare function expectOf(args: {
    expectGeneration?: unknown;
}): {
    expectGeneration?: number;
};
/**
 * Serialize a value for the model with a hard size cap. Values under the cap
 * are returned as-is (so they stay structured); larger ones are replaced by a
 * truncated JSON string and flagged.
 */
export declare function capJson(value: unknown, limit: number): {
    value: unknown;
    truncated: boolean;
};
/**
 * The envelope outcome of a recipe run. `ok` means the run completed and no
 * assertion failed; a run that did less keeps its full report in `result` and
 * gets an `error` that names what happened and what to do next.
 */
export declare function recipeOutcome(run: Pick<RecipeRunResult, 'executionStatus' | 'validationStatus' | 'failedStep' | 'message'>): ActionOutcome;
