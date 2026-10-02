/**
 * Recipe schema v2: strict locators, goto/clear steps, typed inputs and outputs,
 * and asset-level postconditions.
 *
 * v1 recipes (`schemaVersion` absent or 1) never pass through this module: they
 * keep `.first()` and the old fill rule. A v2 step locates with a LocatorSpec,
 * which must match exactly one element unless it carries `index` + `indexReason`
 * (or the converter's `explicitFirst` marker).
 * @module dsh-browser/automation-v2
 */
import { type BrowserLocatorSpec } from './locator.ts';
export declare const WAIT_CONDITIONS_V2: readonly ["locator", "text", "url", "load", "time"];
export declare const STEP_TYPES_V2: readonly ["wait", "click", "fill", "clear", "type", "press", "select", "check", "hover", "scroll", "goto", "extract", "assert", "screenshot"];
export declare const EXTRACT_MODES_V2: readonly ["text", "html", "links", "attribute"];
export declare const INPUT_TYPES: readonly ["string", "number", "enum"];
export declare const OUTPUT_TYPES: readonly ["string", "number", "json"];
/** `{role,name?,exact?} | {label} | {text} | {testId} | {css}`, plus `framePath`, `index`+`indexReason`, `explicitFirst`. */
export type RecipeLocator = Omit<BrowserLocatorSpec, 'selector' | 'frame'>;
export interface BrowserRecipeStepV2 {
    type: typeof STEP_TYPES_V2[number];
    locator?: RecipeLocator;
    condition?: typeof WAIT_CONDITIONS_V2[number];
    value?: string;
    allowEmpty?: boolean;
    key?: string;
    url?: string;
    text?: string;
    urlIncludes?: string;
    mode?: typeof EXTRACT_MODES_V2[number];
    attribute?: string;
    limit?: number;
    as?: string;
    checked?: boolean;
    deltaY?: number;
    waitMs?: number;
    timeoutMs?: number;
}
export interface InputSpec {
    name: string;
    type: typeof INPUT_TYPES[number];
    required?: boolean;
    example?: string | number;
    enumValues?: string[];
    description?: string;
}
export interface OutputSpec {
    name: string;
    type: typeof OUTPUT_TYPES[number];
    description?: string;
}
export type Postcondition = {
    selector: string;
    timeoutMs?: number;
} | {
    text: string;
    timeoutMs?: number;
} | {
    urlIncludes: string;
    timeoutMs?: number;
} | {
    output: string;
    nonEmpty?: true;
    allowEmpty?: true;
};
/** A step the v1 converter could not make strict: it still takes the first match, and should be made unique. */
export interface PendingDisambiguation {
    step: number;
    action: string;
    kind: 'explicit-first';
    locator: RecipeLocator;
}
/** What the runner needs besides the steps. */
export interface RecipeV2Options {
    postconditions?: readonly Postcondition[];
    outputSchema?: readonly OutputSpec[];
    /** goto may land on these domains (a host equal to one of them, or a subdomain). */
    allowedDomains?: readonly string[];
    /** An inline recipe may also stay on the origin of the page it started on. */
    sameOrigin?: string;
    /** Navigate like `target.open` does (usage governor, settle, rule steps); supplied by the service. */
    goto?: (url: string) => Promise<void>;
}
/** True when `host` is one of `domains` or a subdomain of one. */
export declare function hostInDomains(host: string, domains: readonly string[]): boolean;
/**
 * Refuse a recipe whose literal goto URLs leave the allowed domains, before any step runs.
 * Throws a message with "is not allowed on", which the shared mapping reports as POLICY_DENIED.
 */
export declare function assertGotoAllowed(steps: readonly BrowserRecipeStepV2[], options: Pick<RecipeV2Options, 'allowedDomains' | 'sameOrigin'>): void;
/** Structural validation of v2 steps. Throws a message the model can act on; nothing is run. */
export declare function validateRecipeV2(steps: readonly BrowserRecipeStepV2[]): void;
/** Every `{{name}}` used by the steps and postconditions. */
export declare function placeholderNames(...values: unknown[]): string[];
export declare function normalizeInputSchema(raw: unknown): InputSpec[];
export declare function normalizeOutputSchema(raw: unknown, steps: readonly BrowserRecipeStepV2[]): OutputSpec[];
export declare function normalizePostconditions(raw: unknown, steps: readonly BrowserRecipeStepV2[]): Postcondition[];
export declare function normalizeRequiredCapabilities(raw: unknown): string[];
/** Steps whose locator still takes the first match without a reason: left by the v1 converter. */
export declare function pendingDisambiguation(steps: readonly BrowserRecipeStepV2[]): PendingDisambiguation[];
/**
 * Validate caller inputs against the declared schema and convert them to the
 * strings placeholders are replaced with: numbers are parsed and canonicalized,
 * enums must be a listed value, an optional input left out becomes "".
 */
export declare function coerceInputs(schema: readonly InputSpec[], raw: unknown): Record<string, string>;
/** Replace `{{name}}` in every string of a step or postcondition. `type` and `indexReason` are never touched. */
export declare function materializeDeep<T>(value: T, inputs: Record<string, string>): T;
export interface StepContext extends RecipeV2Options {
    captureScreenshot: () => Promise<string>;
}
/** Run one v2 step. Returns the value an extract or screenshot step produced. */
export declare function runStepV2(page: any, step: BrowserRecipeStepV2, ctx: StepContext): Promise<string | undefined>;
/** Turn an extracted string into the declared output type. Returns the typed value, or a problem description. */
export declare function coerceOutput(spec: OutputSpec, value: unknown): {
    ok: true;
    value: unknown;
} | {
    ok: false;
    problem: string;
};
export interface PostconditionOutcome {
    /** One line per condition that did not hold. */
    failures: string[];
    /** A failure that is not "did not hold" (page closed, ...): reported as the step failure itself. */
    error?: unknown;
}
/** Check every postcondition; a condition that does not hold is described, never thrown. */
export declare function evaluatePostconditions(page: any, conditions: readonly Postcondition[], outputs: readonly {
    name?: string;
    value: unknown;
}[], signal?: AbortSignal): Promise<PostconditionOutcome>;
