/**
 * Error mapping: Playwright and service errors to the structured codes of the
 * tool contract (§5). The original message is always preserved; the code and
 * hint only add what the model should do next.
 * @module dsh-browser/actions/errors
 */
import { type ActionErrorBody, type ErrorCode } from './types.ts';
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
/** Map any thrown value to a structured error body. */
export declare function mapError(error: unknown, action: string, opts?: {
    signal?: AbortSignal;
}): ActionErrorBody;
