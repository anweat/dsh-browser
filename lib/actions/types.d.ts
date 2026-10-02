/**
 * Action registry types.
 *
 * Every model-visible browser capability is one {@link ActionDef}: a name of
 * the form `group.action`, a one-line summary, a parameter schema, an approval
 * class, an availability rule, and the function that runs it. The `indexed`
 * and `flat` tool surfaces are both projections of this one registry, so a
 * capability is defined, validated, approved, and executed in exactly one place.
 * @module dsh-browser/actions/types
 */
import type { ResolvedConfig } from '../config.ts';
import type { BrowserService } from '../browser-service.ts';
import type { AutomationAssetStore } from '../automation-assets.ts';
import type { AutomationDevelopmentService } from '../automation-development.ts';
import type { LocatorAmbiguity } from '../locator.ts';
export declare const ACTION_GROUPS: readonly ["runtime", "target", "observe", "act", "inspect", "script", "automation", "crawl", "opencli"];
export type ActionGroup = typeof ACTION_GROUPS[number];
/** Shared sub-schemas defined once and referenced by name from parameters. */
export type SharedSchemaName = 'locator' | 'frame' | 'recipeStep' | 'recipeLocator' | 'postcondition' | 'inputSpec' | 'outputSpec';
/**
 * One parameter node. The shape is deliberately a subset of the Host's tool
 * parameter DSL, so the same nodes feed the flat tool projection unchanged
 * once `ref` nodes are expanded.
 */
export interface ParamNode {
    type?: 'string' | 'number' | 'boolean' | 'array' | 'object';
    description?: string;
    enum?: readonly string[];
    /** Marks a property of the enclosing object as required. */
    required?: true;
    items?: ParamNode;
    properties?: Record<string, ParamNode>;
    additionalProperties?: boolean;
    /** Reference to a shared sub-schema, expanded on demand. */
    ref?: SharedSchemaName;
}
export type ParamSchema = Record<string, ParamNode>;
/**
 * How an action is approved. The classes mirror the pre-registry rules in
 * `approval-policy.ts`; the policy interprets them per automationMode.
 */
export type ApprovalClass = 'none' | 'interaction' | 'install' | 'upload' | 'evaluate' | 'userscript' | 'opencli' | 'recipe' | 'asset-run' | 'asset-develop';
export interface ActionExample {
    args: Record<string, unknown>;
    note?: string;
}
/** What an executing action may touch. Built per call by the tool layer. */
export interface ActionContext {
    service: BrowserService;
    config: ResolvedConfig;
    assets?: AutomationAssetStore;
    development?: AutomationDevelopmentService;
    /** Session bucket key ({@link import('../browser-service.ts').sessionKeyFor}). */
    session: string;
    /** Plain session id used to attribute drafts. */
    sessionId: string;
    /** The Host agent identity, for the few operations keyed on the agent itself. */
    agent: unknown;
    signal: AbortSignal;
}
export interface ActionDef {
    /** `group.action`. */
    name: string;
    group: ActionGroup;
    /** One sentence shown in the L1 listing. */
    summary: string;
    /** Extra L2 guidance. */
    notes?: string;
    params: ParamSchema;
    approval: ApprovalClass;
    /** Whether the action may run in `read-only` automationMode. */
    readOnly: boolean;
    /** Whether it changes page, local, or remote state (drives OUTCOME handling). */
    mutating: boolean;
    /** Whether sibling calls may overlap (flat surface only; `browser_call` is serial). */
    concurrencySafe: boolean;
    /** Per-call budget; exceeded budgets return DEADLINE. */
    timeoutMs: number;
    /**
     * Set for an executor that honours the abort signal at safe points and returns a structured partial
     * result (recipes). After the deadline aborts it, the call waits up to this many ms for it to return,
     * so the browser is quiet again before the next call and the completed steps are not lost.
     */
    settleMs?: number;
    examples?: ActionExample[];
    /** Which error codes callers should expect beyond the generic set. */
    errors?: string[];
    execute(args: Record<string, any>, ctx: ActionContext): Promise<unknown>;
}
/** Raised by an executor for a malformed call that schema validation cannot express. */
export declare class ActionArgError extends Error {
    readonly hint?: string | undefined;
    constructor(message: string, hint?: string | undefined);
}
/** Raised when an action cannot run in the current environment. */
export declare class ActionUnavailableError extends Error {
    readonly hint?: string | undefined;
    constructor(message: string, hint?: string | undefined);
}
export declare const ERROR_CODES: readonly ["INVALID_ARGS", "UNKNOWN_ACTION", "CAPABILITY_UNAVAILABLE", "POLICY_DENIED", "LOCATOR_NOT_FOUND", "LOCATOR_AMBIGUOUS", "NOT_ACTIONABLE", "TARGET_CLOSED", "DEADLINE", "CANCELLED", "NOT_FOUND", "ACTION_FAILED", "VALIDATION_FAILED", "OUTCOME_UNKNOWN", "INVALID_RECIPE"];
export type ErrorCode = typeof ERROR_CODES[number];
export type ExecutionStatus = 'completed' | 'failed' | 'cancelled' | 'outcome_unknown';
export interface ActionErrorBody {
    code: ErrorCode;
    message: string;
    hint?: string;
    /** Compact parameter schema, attached to INVALID_ARGS so the model can fix the call at once. */
    schema?: string;
    /** The first matches of an ambiguous locator (LOCATOR_AMBIGUOUS): role, name, text snippet, visibility. */
    candidates?: LocatorAmbiguity;
}
/**
 * How an executor tells the dispatcher that a returned value is not a plain
 * success: a recipe that ran but failed still returns its full report, and the
 * envelope carries `ok: false` and an error next to it.
 */
export interface ActionOutcome {
    ok: boolean;
    executionStatus: ExecutionStatus;
    error?: ActionErrorBody;
}
/** Attach an outcome to a result object without changing its serialized form. */
export declare function withOutcome<T extends object>(value: T, outcome: ActionOutcome): T;
export declare function outcomeOf(value: unknown): ActionOutcome | undefined;
export interface ActionEnvelope {
    ok: boolean;
    action: string;
    executionStatus: ExecutionStatus;
    result?: Record<string, unknown>;
    error?: ActionErrorBody;
    truncation?: {
        omitted: number;
        reason: string;
    };
}
