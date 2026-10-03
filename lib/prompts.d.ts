/**
 * Deployment overrides of the model-facing text (`prompts` configuration).
 *
 * Every sentence the model reads that is guidance rather than contract can be replaced by the
 * deployer: the two L0 tool descriptions, the root guide, group and action summaries and notes,
 * error hints, and the `dsh-browser` skill. Names, parameter schemas, error codes, approval
 * wording and the compliance notice are NOT configurable.
 *
 * This module is the one place that knows the shape: it validates a raw `prompts` value into
 * {@link ResolvedPrompts} (never throwing: bad entries are dropped and reported as diagnostics),
 * lists the built-in defaults in the same shape ({@link defaultPrompts}, behind `prompts:dump`),
 * and measures what an override does to the context budget.
 * @module dsh-browser/prompts
 */
import { type ActionGroup } from './actions/types.ts';
import { CHARS_PER_TOKEN } from './tool-defs.ts';
import { PROMPT_LIMITS } from './prompt-limits.ts';
import type { AutomationMode, ExposureOptions } from './freedom.ts';
export { PROMPT_LIMITS };
/** Context budgets from the tool-system design (estimated tokens = characters / 3.5, as `measure:tools` counts). */
export { CHARS_PER_TOKEN };
export declare const L0_BUDGET_TOKENS = 1500;
export declare const LAYER_BUDGET_TOKENS = 1000;
export type PromptDiagnosticCode = 'invalid-type' | 'too-long' | 'unknown-key' | 'unknown-group' | 'unknown-action' | 'unknown-error-code' | 'not-overridable' | 'relative-body-file' | 'body-file' | 'budget-l0' | 'budget-layer';
export interface PromptDiagnostic {
    level: 'warn' | 'info';
    code: PromptDiagnosticCode;
    /** The configuration key the entry is about, e.g. `actions.act.click.summary`. */
    key: string;
    message: string;
}
/** One accepted override, by key and length only (the text itself is never echoed back). */
export interface AppliedPrompt {
    key: string;
    length?: number;
}
/** The validated, effective overrides. Absent members mean "use the built-in text". */
export interface ResolvedPrompts {
    tools: {
        browser_index?: string;
        browser_call?: string;
    };
    rootGuide?: string;
    rootNote?: string;
    groups: Partial<Record<ActionGroup, string>>;
    /** Keyed by `group.action`, `group.action.sub` or `group.action.topic`; a topic's `notes` is its detail text. */
    actions: Record<string, {
        summary?: string;
        notes?: string;
    }>;
    errorHints: Partial<Record<string, string>>;
    skill: {
        enabled: boolean;
        description?: string;
        bodyFile?: string;
        append?: string;
    };
    applied: AppliedPrompt[];
    diagnostics: PromptDiagnostic[];
}
/** The overrides of nothing: what the plugin uses when `prompts` is not configured. */
export declare const NO_PROMPTS: ResolvedPrompts;
/** The error codes whose hint has one fixed text, and so can be replaced. */
export declare const OVERRIDABLE_ERROR_CODES: readonly string[];
/**
 * Validate a raw `prompts` value. Never throws: a malformed or unknown entry is left out and described in
 * `diagnostics`; everything else still applies.
 */
export declare function resolvePrompts(raw: unknown): ResolvedPrompts;
/** A live view of the configured overrides. `current()` re-reads the config each time, so a change applies to the next call. */
export interface PromptsSource {
    current(): ResolvedPrompts;
}
/**
 * Wrap a reader of the raw `prompts` value. The result is cached by the identity of what the reader returns, so
 * an unchanged config costs nothing per call while a changed one (a volatile reference holds a new snapshot after
 * every write) is validated again.
 */
export declare function promptsSource(read: () => unknown): PromptsSource;
/** A source that never overrides anything. */
export declare const NO_PROMPTS_SOURCE: PromptsSource;
/**
 * Every overridable text with its built-in value, in the exact structure of the `prompts` configuration. Pasted back
 * as the configuration it changes nothing (a blank `notes`, `rootNote` or `append` means "none"), which makes it the
 * starting point for editing: delete what stays default, reword the rest.
 */
export declare function defaultPrompts(): Record<string, unknown>;
/**
 * The text `prompts:dump` prints and the settings card's "Export default text" shows: {@link defaultPrompts} as JSON,
 * two-space indented unless `compact`. One function, so the script and the card cannot drift apart.
 */
export declare function promptsDumpText(compact?: boolean): string;
export interface PromptBudget {
    /** Estimated tokens of the two L0 tools (name + description + parameters, as the host sends them). */
    l0Tokens: number;
    l0Budget: number;
    layerBudget: number;
    /** The largest browser_index layer (root, a group, an action, a sub-action or a topic). */
    largestLayer: {
        name: string;
        tokens: number;
    };
    /** Every layer over the per-layer budget. */
    overBudget: {
        name: string;
        tokens: number;
    }[];
}
export interface BudgetEnvironment {
    mode: AutomationMode;
    options: ExposureOptions;
    enabled: boolean;
}
/** Measure the L0 tools and every browser_index layer under these overrides. */
export declare function measurePromptBudget(prompts: ResolvedPrompts, environment: BudgetEnvironment): PromptBudget;
export interface PromptsStatus {
    /** The overrides in force, by key and length. */
    overrides: AppliedPrompt[];
    /** Everything ignored or worth a warning, including budget overruns. */
    diagnostics: PromptDiagnostic[];
    budget: PromptBudget;
    skill: {
        enabled: boolean;
        body: 'packaged' | 'file';
        bodyFile?: string;
    };
}
/** What `runtime.status` reports under `prompts`, and the settings panel shows. Reads the live configuration. */
export declare function describePrompts(config: {
    prompts?: PromptsSource;
} & BudgetEnvironment): PromptsStatus;
