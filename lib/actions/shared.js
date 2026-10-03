/** Helpers shared by the action group modules. @module dsh-browser/actions/shared */
import { hintFor } from "./errors.js";
import { ActionArgError } from "./types.js";
export const COMPLIANCE_NOTICE = 'The caller/operator must use this capability according to the target site rules and applicable requirements; dsh-browser only executes the requested browser operation and does not determine whether a particular use is permitted.';
/** Resolve the selector-or-locator pair every element-targeting action accepts. */
export function targetOf(args, required = true) {
    if (typeof args.selector === 'string' && args.locator === undefined)
        return args.selector;
    if (args.selector === undefined && args.locator && typeof args.locator === 'object')
        return args.locator;
    if (!required && args.selector === undefined && args.locator === undefined)
        return undefined;
    throw new ActionArgError('provide exactly one of selector or locator', 'Pass either selector (CSS string) or locator (object), not both.');
}
/** The `expectGeneration` guard of an act.* call, ready to spread into the service options. */
export function expectOf(args) {
    return typeof args.expectGeneration === 'number' ? { expectGeneration: args.expectGeneration } : {};
}
/**
 * Serialize a value for the model with a hard size cap. Values under the cap
 * are returned as-is (so they stay structured); larger ones are replaced by a
 * truncated JSON string and flagged.
 */
export function capJson(value, limit) {
    const raw = JSON.stringify(value);
    if (raw === undefined || raw.length <= limit)
        return { value, truncated: false };
    return { value: raw.slice(0, limit), truncated: true };
}
/**
 * The envelope outcome of a recipe run. `ok` means the run completed and no
 * assertion failed; a run that did less keeps its full report in `result` and
 * gets an `error` that names what happened and what to do next.
 */
export function recipeOutcome(run) {
    if (run.executionStatus === 'completed' && run.validationStatus !== 'failed')
        return { ok: true, executionStatus: 'completed' };
    const code = run.executionStatus === 'outcome_unknown' ? 'OUTCOME_UNKNOWN'
        : run.failedStep?.errorCode ?? (run.executionStatus === 'cancelled' ? 'CANCELLED' : run.validationStatus === 'failed' ? 'VALIDATION_FAILED' : 'ACTION_FAILED');
    const original = run.failedStep ? ` [step ${run.failedStep.index} ${run.failedStep.action}, ${run.failedStep.errorCode}] ${run.failedStep.message}` : '';
    const message = (run.message ?? 'The run did not complete.') + (run.message && original ? ' Original error:' + original : original);
    const hint = hintFor(code) ?? 'The run did not complete; read completedSteps, failedStep and effects before deciding what to do.';
    return { ok: false, executionStatus: run.executionStatus, error: { code, message, hint, ...run.failedStep?.candidates ? { candidates: run.failedStep.candidates } : {} } };
}
//# sourceMappingURL=shared.js.map