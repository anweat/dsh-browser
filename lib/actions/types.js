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
export const ACTION_GROUPS = ['runtime', 'target', 'observe', 'act', 'inspect', 'script', 'automation', 'crawl', 'opencli'];
/** Raised by an executor for a malformed call that schema validation cannot express. */
export class ActionArgError extends Error {
    hint;
    constructor(message, hint) {
        super(message);
        this.hint = hint;
        this.name = 'ActionArgError';
    }
}
/** Raised when an action cannot run in the current environment. */
export class ActionUnavailableError extends Error {
    hint;
    constructor(message, hint) {
        super(message);
        this.hint = hint;
        this.name = 'ActionUnavailableError';
    }
}
export const ERROR_CODES = [
    'INVALID_ARGS', 'UNKNOWN_ACTION', 'CAPABILITY_UNAVAILABLE', 'POLICY_DENIED',
    'LOCATOR_NOT_FOUND', 'LOCATOR_AMBIGUOUS', 'NOT_ACTIONABLE', 'TARGET_CLOSED',
    'DEADLINE', 'CANCELLED', 'NOT_FOUND', 'ACTION_FAILED',
    // Recipe execution (B2): the failure says what already happened, not only that something failed.
    'VALIDATION_FAILED', 'OUTCOME_UNKNOWN', 'INVALID_RECIPE',
];
const OUTCOMES = new WeakMap();
/** Attach an outcome to a result object without changing its serialized form. */
export function withOutcome(value, outcome) {
    OUTCOMES.set(value, outcome);
    return value;
}
export function outcomeOf(value) {
    return value !== null && typeof value === 'object' ? OUTCOMES.get(value) : undefined;
}
//# sourceMappingURL=types.js.map