/**
 * Bounded, auditable Playwright recipes for model-generated browser flows.
 * Recipes deliberately expose named operations instead of arbitrary JavaScript.
 * @module dsh-browser/automation
 */
import type { ErrorCode } from './actions/types.ts';
export declare const WAIT_CONDITIONS: readonly ["selector", "text", "load", "time"];
export declare const EXTRACT_MODES: readonly ["text", "html", "links", "attribute"];
export type BrowserRecipeStep = {
    type: 'wait';
    condition: 'selector' | 'text' | 'load' | 'time';
    value?: string;
    waitMs?: number;
    timeoutMs?: number;
} | {
    type: 'click';
    selector: string;
    timeoutMs?: number;
} | {
    type: 'fill';
    selector: string;
    value: string;
    timeoutMs?: number;
} | {
    type: 'type';
    selector: string;
    value: string;
    timeoutMs?: number;
} | {
    type: 'press';
    key: string;
    selector?: string;
} | {
    type: 'select';
    selector: string;
    value: string;
} | {
    type: 'check';
    selector: string;
    checked?: boolean;
} | {
    type: 'hover';
    selector: string;
} | {
    type: 'scroll';
    deltaY?: number;
    waitMs?: number;
} | {
    type: 'extract';
    selector?: string;
    mode?: 'text' | 'html' | 'links' | 'attribute';
    attribute?: string;
    limit?: number;
} | {
    type: 'assert';
    selector?: string;
    text?: string;
    timeoutMs?: number;
} | {
    type: 'screenshot';
};
export interface RecipeStepResult {
    step: number;
    action: BrowserRecipeStep['type'];
    ok: boolean;
    value?: string;
}
export type RecipeExecutionStatus = 'completed' | 'failed' | 'cancelled' | 'outcome_unknown';
export type RecipeValidationStatus = 'not_checked' | 'passed' | 'failed';
export type RecipeEffects = 'none' | 'observed' | 'unknown';
export interface RecipeFailedStep {
    /** 1-based, the same numbering as {@link RecipeStepResult.step}. */
    index: number;
    action: BrowserRecipeStep['type'] | 'userscript';
    errorCode: ErrorCode;
    /** The original Playwright or service message, unchanged. */
    message: string;
}
export interface RecipeOutput {
    step: number;
    action: 'extract' | 'screenshot';
    value: string;
}
/**
 * What a recipe run did. Execution and validation are separate axes: steps can
 * all run (`completed`) while an assert still failed (`validationStatus: failed`).
 * A failure is a value, not an exception, so the steps that already ran and
 * the side effects they caused are never lost.
 */
export interface RecipeRunResult {
    executionStatus: RecipeExecutionStatus;
    /** `passed` only when the recipe has assert steps and every one of them ran and held. */
    validationStatus: RecipeValidationStatus;
    /** The steps that finished, in the original per-step format. */
    completedSteps: RecipeStepResult[];
    /** The step that failed, or the step a cancel/deadline stopped before. Absent when everything ran. */
    failedStep?: RecipeFailedStep;
    /** Whether state-changing steps (fill, type, click, press, select, check) took effect. */
    effects: RecipeEffects;
    /** Values produced by extract and screenshot steps. */
    outputs: RecipeOutput[];
    /** One-line summary of why the run is not `completed`. */
    message?: string;
    /** An unknown extract mode ran through the pre-B2 `links` branch (stored v1 assets only). */
    legacyFallback?: true;
}
export interface RunRecipeOptions {
    /** Stored v1 assets keep their old behaviour for an unknown extract mode instead of being rejected. */
    legacy?: boolean;
}
/**
 * Reject enum values the runner does not implement. Used by `validateRecipe`
 * and by the asset store when a draft is saved, so an unknown value never
 * reaches storage.
 */
export declare function validateRecipeEnums(steps: readonly BrowserRecipeStep[], options?: RunRecipeOptions): void;
export declare function validateRecipe(steps: readonly BrowserRecipeStep[], options?: RunRecipeOptions): void;
export declare function recipeNeedsApproval(steps: readonly BrowserRecipeStep[]): boolean;
/**
 * Run the steps in order and report what happened as a value.
 *
 * Cancellation is checked before every step and once more after the last one.
 * A step already running cannot be interrupted (Playwright offers no way to do
 * that without closing the page), so a cancel takes effect when that step
 * returns; nothing is rolled back. A malformed recipe still throws
 * {@link RecipeValidationError} before any step runs.
 */
export declare function runRecipe(page: any, steps: readonly BrowserRecipeStep[], captureScreenshot: () => Promise<string>, signal?: AbortSignal, options?: RunRecipeOptions): Promise<RecipeRunResult>;
