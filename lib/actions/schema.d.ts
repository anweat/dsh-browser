/**
 * Shared sub-schemas plus the validator and renderers for action parameters.
 *
 * `LOCATOR_SCHEMA` and friends are defined exactly once. Actions reference them
 * with `{ ref: 'locator' }`; the flat tool surface expands the reference inline
 * (the Host needs a self-contained schema per tool) and the indexed surface
 * prints them once in the L2 detail.
 * @module dsh-browser/actions/schema
 */
import type { ParamNode, ParamSchema, SharedSchemaName } from './types.ts';
export declare const SHARED_SCHEMAS: Record<SharedSchemaName, ParamNode>;
/** The two params every element-targeting action accepts. */
export declare const TARGET_PARAMS: ParamSchema;
/** Optional guard of the act.* actions that change or press into the page. */
export declare const EXPECT_PARAMS: ParamSchema;
/** Expand every `ref` inline: the self-contained shape a flat tool needs. */
export declare function expandNode(node: ParamNode): ParamNode;
export declare function expandParams(params: ParamSchema): ParamSchema;
export interface ValidationResult {
    ok: boolean;
    value: Record<string, unknown>;
    errors: string[];
}
/** Validate call arguments against an action's parameter schema. */
export declare function validateArgs(params: ParamSchema, args: unknown): ValidationResult;
/** One-line parameter summary: `selector?: string, locator?: $locator`. */
export declare function compactParams(params: ParamSchema): string;
/** Compact schema block attached to INVALID_ARGS replies. */
export declare function compactSchema(action: string, params: ParamSchema): string;
/** Full parameter listing with descriptions, followed by each shared sub-schema once. */
export declare function describeParams(params: ParamSchema): string[];
