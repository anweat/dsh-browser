/**
 * Error mapping: Playwright and service errors to the structured codes of the
 * tool contract (§5). The original message is always preserved; the code and
 * hint only add what the model should do next.
 * @module dsh-browser/actions/errors
 */
import { type ActionErrorBody, type ErrorCode } from './types.ts';
export declare function hintFor(code: ErrorCode): string | undefined;
/** Map any thrown value to a structured error body. */
export declare function mapError(error: unknown, action: string, opts?: {
    signal?: AbortSignal;
}): ActionErrorBody;
