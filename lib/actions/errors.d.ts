/**
 * Error mapping: Playwright and service errors to the structured codes of the
 * tool contract (§5). The original message is always preserved; the code and
 * hint only add what the model should do next.
 * @module dsh-browser/actions/errors
 */
import { type ActionErrorBody, type ErrorCode } from './types.ts';
/** The built-in hint of every error code that has one fixed text. These are what `prompts.errorHints` can replace. */
export declare const DEFAULT_ERROR_HINTS: Readonly<Partial<Record<ErrorCode, string>>>;
type HintSource = () => Readonly<Partial<Record<string, string>>>;
/** Install a live source of hint overrides. @returns the function that removes it. */
export declare function installErrorHints(source: HintSource): () => void;
/** The hint for a code: the configured override, else the built-in text (undefined when the code has none). */
export declare function hintFor(code: ErrorCode): string | undefined;
/** Thrown by a recipe `assert` step whose condition did not become true in time. */
export declare class RecipeAssertionError extends Error {
    constructor(message: string);
}
/** Thrown for a malformed recipe (bad step fields, out-of-range limits, unknown enum values). */
export declare class RecipeValidationError extends Error {
    constructor(message: string);
}
/** The abort reason of an action whose overall deadline expired, so a stop can be told apart from a user cancel. */
export declare class DeadlineError extends Error {
    constructor(message?: string);
}
/** True when the signal was aborted because the overall deadline expired. */
export declare function abortedByDeadline(signal: AbortSignal | undefined): boolean;
/** True for a Playwright timeout (waiting for a locator, an actionability check, or a navigation). */
export declare function isTimeoutError(error: unknown): boolean;
/** Playwright colours its call log for terminals; the model and the settings card get plain text. */
export declare function stripAnsi(text: string): string;
/**
 * True when a failure proves the action never touched an element: the locator
 * never matched anything (a timeout whose call log only says "waiting for
 * locator", or a frame that does not exist). A timeout after the element was
 * resolved and the action began says nothing about whether it took effect, so
 * it is not this. Judged from Playwright's call log; a timeout without a call
 * log is treated as "unknown", never as "never reached".
 */
export declare function neverReachedElement(error: unknown): boolean;
/**
 * True when a timeout proves the action never ran although the element was found: the call log shows
 * Playwright waiting for it to become visible, enabled, stable or editable (or for an overlay to move)
 * and never reaches the line that says the action is being performed. Needs a call log; without one
 * (or with a performed marker) the outcome stays unknown.
 */
export declare function blockedBeforeAction(error: unknown): boolean;
/** Map any thrown value to a structured error body. */
export declare function mapError(error: unknown, action: string, opts?: {
    signal?: AbortSignal;
}): ActionErrorBody;
export {};
