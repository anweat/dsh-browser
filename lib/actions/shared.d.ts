/** Helpers shared by the action group modules. @module dsh-browser/actions/shared */
import type { BrowserTarget } from '../browser-service.ts';
export declare const COMPLIANCE_NOTICE = "The caller/operator must use this capability according to the target site rules and applicable requirements; dsh-browser only executes the requested browser operation and does not determine whether a particular use is permitted.";
/** Resolve the selector-or-locator pair every element-targeting action accepts. */
export declare function targetOf(args: {
    selector?: unknown;
    locator?: unknown;
}, required?: boolean): BrowserTarget | undefined;
/**
 * Serialize a value for the model with a hard size cap. Values under the cap
 * are returned as-is (so they stay structured); larger ones are replaced by a
 * truncated JSON string and flagged.
 */
export declare function capJson(value: unknown, limit: number): {
    value: unknown;
    truncated: boolean;
};
