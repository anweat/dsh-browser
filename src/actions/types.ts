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

import type { ResolvedConfig } from '../config.ts'
import type { BrowserService } from '../browser-service.ts'
import type { AutomationAssetStore } from '../automation-assets.ts'
import type { AutomationDevelopmentService } from '../automation-development.ts'
import type { LocatorAmbiguity, PageGeneration } from '../locator.ts'

export const ACTION_GROUPS = ['runtime', 'target', 'observe', 'act', 'inspect', 'script', 'automation', 'crawl', 'opencli'] as const
export type ActionGroup = typeof ACTION_GROUPS[number]

/** Shared sub-schemas defined once and referenced by name from parameters. */
export type SharedSchemaName = 'locator' | 'frame' | 'recipeStep' | 'recipeLocator' | 'postcondition' | 'inputSpec' | 'outputSpec'

/**
 * One parameter node. The shape is deliberately a subset of the Host's tool
 * parameter DSL, so the same nodes feed the flat tool projection unchanged
 * once `ref` nodes are expanded.
 */
export interface ParamNode {
  type?: 'string' | 'number' | 'boolean' | 'array' | 'object'
  description?: string
  enum?: readonly string[]
  /** Marks a property of the enclosing object as required. */
  required?: true
  items?: ParamNode
  properties?: Record<string, ParamNode>
  additionalProperties?: boolean
  /** Reference to a shared sub-schema, expanded on demand. */
  ref?: SharedSchemaName
}

export type ParamSchema = Record<string, ParamNode>

/**
 * How an action is approved. The classes mirror the pre-registry rules in
 * `approval-policy.ts`; the policy interprets them per automationMode.
 */
export type ApprovalClass =
  | 'none'
  | 'interaction'
  | 'install'
  | 'upload'
  | 'evaluate'
  | 'userscript'
  | 'opencli'
  | 'recipe'
  | 'asset-run'
  | 'asset-develop'

export interface ActionExample {
  args: Record<string, unknown>
  note?: string
}

/** What an executing action may touch. Built per call by the tool layer. */
export interface ActionContext {
  service: BrowserService
  config: ResolvedConfig
  assets?: AutomationAssetStore
  development?: AutomationDevelopmentService
  /** Session bucket key ({@link import('../browser-service.ts').sessionKeyFor}). */
  session: string
  /** Plain session id used to attribute drafts. */
  sessionId: string
  /** The Host agent identity, for the few operations keyed on the agent itself. */
  agent: unknown
  signal: AbortSignal
}

/** The flags that differ per sub-action for an action that bundles several operations behind one `action` argument. */
export interface ActionTraits {
  readOnly: boolean
  mutating: boolean
  concurrencySafe: boolean
}

/** One operation of an action such as `automation.develop`: its own summary, parameters and traits. */
export interface SubActionDef {
  summary: string
  /** Names from the action's `params` that this operation uses (the selector argument itself is implied). */
  params: readonly string[]
  /** Which of those must be present for this operation (the shared schema marks none required). */
  required?: readonly string[]
  /** Per-parameter description for this operation, replacing the action-level one. */
  hints?: Record<string, string>
  /** Error codes this operation can return; when set, the detail lists these instead of the action-wide set. */
  errors?: readonly string[]
  /** Extra guidance shown only in this operation's detail. */
  notes?: string
  examples?: ActionExample[]
  /** Overrides the action-level flags for this operation. */
  traits?: Partial<ActionTraits>
}

export interface SubActionSet {
  /** The argument that selects the operation (`action`). */
  key: string
  /** Parameters every operation takes, listed once with the action. */
  common: readonly string[]
  items: Record<string, SubActionDef>
}

/** An extra detail page of an action, read with `browser_index({action:"<action>.<topic>"})`. Keeps the action's own detail short. */
export interface ActionTopic {
  summary: string
  text: string
}

export interface ActionDef {
  /** `group.action`. */
  name: string
  group: ActionGroup
  /** One sentence shown in the L1 listing. */
  summary: string
  /** Extra L2 guidance. */
  notes?: string
  params: ParamSchema
  approval: ApprovalClass
  /**
   * Whether the action may run in `read-only` automationMode. With {@link subActions} this is the
   * strictest value (what an unknown or unlisted operation gets); operations that are safe say so in their traits.
   */
  readOnly: boolean
  /** Whether it changes page, local, or remote state (drives OUTCOME handling). Strictest value when there are sub-actions. */
  mutating: boolean
  /** Whether sibling calls may overlap (flat surface only; `browser_call` is serial). Strictest value when there are sub-actions. */
  concurrencySafe: boolean
  /** Operations behind one `action` argument, each with its own flags, detail view, and approval. */
  subActions?: SubActionSet
  /** Detail pages for parts of the result (observe.read: one per section), listed in the action detail. */
  topics?: Record<string, ActionTopic>
  /** Per-call budget; exceeded budgets return DEADLINE. */
  timeoutMs: number
  /**
   * Set for an executor that honours the abort signal at safe points and returns a structured partial
   * result (recipes). After the deadline aborts it, the call waits up to this many ms for it to return,
   * so the browser is quiet again before the next call and the completed steps are not lost.
   */
  settleMs?: number
  examples?: ActionExample[]
  /** Which error codes callers should expect beyond the generic set. */
  errors?: string[]
  execute(args: Record<string, any>, ctx: ActionContext): Promise<unknown>
}

/** Raised by an executor for a malformed call that schema validation cannot express. */
export class ActionArgError extends Error {
  constructor(message: string, readonly hint?: string) {
    super(message)
    this.name = 'ActionArgError'
  }
}

/** Raised when an action cannot run in the current environment. */
export class ActionUnavailableError extends Error {
  constructor(message: string, readonly hint?: string) {
    super(message)
    this.name = 'ActionUnavailableError'
  }
}

export const ERROR_CODES = [
  'INVALID_ARGS', 'UNKNOWN_ACTION', 'CAPABILITY_UNAVAILABLE', 'POLICY_DENIED',
  'LOCATOR_NOT_FOUND', 'LOCATOR_AMBIGUOUS', 'NOT_ACTIONABLE', 'TARGET_CLOSED', 'TARGET_STALE',
  'DEADLINE', 'CANCELLED', 'NOT_FOUND', 'ACTION_FAILED',
  // Recipe execution (B2): the failure says what already happened, not only that something failed.
  'VALIDATION_FAILED', 'OUTCOME_UNKNOWN', 'INVALID_RECIPE',
  // A draft test cannot pass because nothing in the asset verifies its result (B4).
  'VALIDATION_MISSING',
] as const
export type ErrorCode = typeof ERROR_CODES[number]

export type ExecutionStatus = 'completed' | 'failed' | 'cancelled' | 'outcome_unknown'

export interface ActionErrorBody {
  code: ErrorCode
  message: string
  hint?: string
  /** Compact parameter schema, attached to INVALID_ARGS so the model can fix the call at once. */
  schema?: string
  /** The first matches of an ambiguous locator (LOCATOR_AMBIGUOUS): role, name, text snippet, visibility. */
  candidates?: LocatorAmbiguity
  /** The page's current target id and generation (TARGET_STALE): what the next call should expect after observing again. */
  current?: PageGeneration
}

/**
 * How an executor tells the dispatcher that a returned value is not a plain
 * success: a recipe that ran but failed still returns its full report, and the
 * envelope carries `ok: false` and an error next to it.
 */
export interface ActionOutcome {
  ok: boolean
  executionStatus: ExecutionStatus
  error?: ActionErrorBody
}

const OUTCOMES = new WeakMap<object, ActionOutcome>()

/** Attach an outcome to a result object without changing its serialized form. */
export function withOutcome<T extends object>(value: T, outcome: ActionOutcome): T {
  OUTCOMES.set(value, outcome)
  return value
}

export function outcomeOf(value: unknown): ActionOutcome | undefined {
  return value !== null && typeof value === 'object' ? OUTCOMES.get(value) : undefined
}

export interface ActionEnvelope {
  ok: boolean
  action: string
  executionStatus: ExecutionStatus
  result?: Record<string, unknown>
  error?: ActionErrorBody
  truncation?: { omitted: number; reason: string }
}
