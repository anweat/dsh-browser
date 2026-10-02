/**
 * Error mapping: Playwright and service errors to the structured codes of the
 * tool contract (§5). The original message is always preserved; the code and
 * hint only add what the model should do next.
 * @module dsh-browser/actions/errors
 */
import { ActionArgError, ActionUnavailableError } from "./types.js";
import { LocatorAmbiguousError } from "../locator.js";
const HINTS = {
    LOCATOR_NOT_FOUND: 'No element matched. Re-read the page (observe.read), check the locator, and wait for dynamic content (act.wait) before retrying.',
    LOCATOR_AMBIGUOUS: 'More than one element matched and nothing was done. Pick the intended element from candidates: narrow the locator (role+name, exact, label, testId, frame), or give index with indexReason.',
    NOT_ACTIONABLE: 'The element exists but cannot take this action now (hidden, disabled, covered, or still moving). Wait for it or dismiss the overlay.',
    TARGET_CLOSED: 'The page is gone or none is open. Call target.open first.',
    DEADLINE: 'The action ran out of time. Re-read the page to see whether it took effect before retrying.',
    CANCELLED: 'The call was cancelled before it finished.',
    CAPABILITY_UNAVAILABLE: 'This capability is not available in the current setup (see browser_index() for runtime state; runtime.install installs Chromium).',
    POLICY_DENIED: 'Blocked by the plugin policy for this automationMode or by input validation.',
    NOT_FOUND: 'The referenced item does not exist. Use automation.search to find valid ids.',
    VALIDATION_FAILED: 'The steps ran but an assert step did not hold, so the business result is not confirmed. Read the page (observe.read) to see what happened; if earlier steps submitted something, do not run them again blindly.',
    OUTCOME_UNKNOWN: 'A side-effecting step timed out, so it may or may not have taken effect. Verify the real result on the page (observe.read) before any retry; never resubmit blindly.',
    INVALID_RECIPE: 'The recipe itself is malformed (see the message). Fix the step and send it again; nothing ran.',
};
export function hintFor(code) {
    return HINTS[code];
}
/** Thrown by a recipe `assert` step whose condition did not become true in time. */
export class RecipeAssertionError extends Error {
    constructor(message) {
        super(message);
        this.name = 'RecipeAssertionError';
    }
}
/** Thrown for a malformed recipe (bad step fields, out-of-range limits, unknown enum values). */
export class RecipeValidationError extends Error {
    constructor(message) {
        super(message);
        this.name = 'RecipeValidationError';
    }
}
/** The abort reason of an action whose overall deadline expired, so a stop can be told apart from a user cancel. */
export class DeadlineError extends Error {
    constructor(message = 'deadline') {
        super(message);
        this.name = 'DeadlineError';
    }
}
/** True when the signal was aborted because the overall deadline expired. */
export function abortedByDeadline(signal) {
    return signal?.aborted === true && signal.reason?.name === 'DeadlineError';
}
/** True for a Playwright timeout (waiting for a locator, an actionability check, or a navigation). */
export function isTimeoutError(error) {
    if (error instanceof Error && error.name === 'TimeoutError')
        return true;
    return /Timeout \d+ms exceeded|timed out after/i.test(messageOf(error));
}
function messageOf(error) {
    if (error instanceof Error)
        return error.message;
    return String(error);
}
const NOT_ACTIONABLE_LOG = /locator resolved to|element is not (visible|enabled|stable|editable)|intercepts pointer events|is outside of the viewport|element is disabled|not receive pointer events|Element is not an <input>|readonly/i;
const CLOSED = /Target (page, context or browser has been )?closed|Page closed|has been closed|browser has been closed|Browser closed|Connection closed|Session closed/i;
const UNAVAILABLE = /chromium is not installed|Executable doesn't exist|browser service is disabled|OpenCLI is disabled|persistence is disabled|automation development is disabled|automation assets are unavailable|could not be created/i;
const NO_PAGE = /requires url or an active|no active page|active .* page/i;
const POLICY = /is not allowed (for|on)|outside its allowed match|userscript is invalid|userscript validation failed|auth profile .* (not allowed|storageState)|requires explicit keywords|limit reached/i;
const NOT_FOUND_RE = /(asset|candidate) not found|unknown (auth profile|rule pack|built-in script)/i;
const INVALID = /(must be|must contain|must use|must end|must start|must include|requires|exceeds|is invalid|invalid |unsupported|exactly one|only valid with|cannot combine|not a file|absolute file|missing declared|undeclared|is required|only supports|only draft|only http)/i;
/** Call-log lines that only appear once Playwright has resolved the element and started working on it. */
const ACTION_STARTED_LOG = /locator resolved to|resolved to \d+ elements|attempting .* action|performing .* action|scrolling into view|waiting for element to be|element is |intercepts pointer events|waiting for scheduled navigations|waiting for navigation/i;
/**
 * True when a failure proves the action never touched an element: the locator
 * never matched anything (a timeout whose call log only says "waiting for
 * locator", or a frame that does not exist). A timeout after the element was
 * resolved and the action began says nothing about whether it took effect, so
 * it is not this. Judged from Playwright's call log; a timeout without a call
 * log is treated as "unknown", never as "never reached".
 */
export function neverReachedElement(error) {
    const message = messageOf(error);
    if (/target frame was not found/i.test(message))
        return true;
    if (!isTimeoutError(error))
        return false;
    return /waiting for (locator|selector|getBy|frameLocator)/i.test(message) && !ACTION_STARTED_LOG.test(message);
}
/** Map any thrown value to a structured error body. */
export function mapError(error, action, opts = {}) {
    if (error instanceof ActionArgError)
        return { code: 'INVALID_ARGS', message: error.message, ...error.hint ? { hint: error.hint } : {} };
    if (error instanceof ActionUnavailableError)
        return { code: 'CAPABILITY_UNAVAILABLE', message: error.message, hint: error.hint ?? HINTS.CAPABILITY_UNAVAILABLE };
    const message = messageOf(error);
    const name = error instanceof Error ? error.name : '';
    const result = (code, hint = HINTS[code]) => ({ code, message, ...hint ? { hint } : {} });
    if (error instanceof LocatorAmbiguousError)
        return { ...result('LOCATOR_AMBIGUOUS'), candidates: error.ambiguity };
    if (error instanceof RecipeValidationError)
        return result('INVALID_RECIPE');
    if (error instanceof RecipeAssertionError)
        return result('VALIDATION_FAILED');
    if (abortedByDeadline(opts.signal))
        return result('DEADLINE');
    if (opts.signal?.aborted || name === 'AbortError' || /\baborted\b/i.test(message))
        return result('CANCELLED');
    if (CLOSED.test(message))
        return result('TARGET_CLOSED');
    if (name === 'TimeoutError' || /Timeout \d+ms exceeded|timed out after/i.test(message)) {
        // Waits time out by design; everything else distinguishes "never found" from "found but blocked".
        if (action === 'act.wait' || /timed out after/i.test(message))
            return result('DEADLINE');
        if (NOT_ACTIONABLE_LOG.test(message))
            return result('NOT_ACTIONABLE');
        // "Never found" only when the log stops at the wait; once the element was resolved and the action began, the cause is the deadline.
        if (/waiting for (locator|selector|getBy|frameLocator)/i.test(message) && !ACTION_STARTED_LOG.test(message))
            return result('LOCATOR_NOT_FOUND');
        return result('DEADLINE');
    }
    if (/strict mode violation/i.test(message))
        return result('LOCATOR_AMBIGUOUS');
    if (/target frame was not found/i.test(message))
        return result('LOCATOR_NOT_FOUND');
    if (UNAVAILABLE.test(message))
        return result('CAPABILITY_UNAVAILABLE');
    if (NO_PAGE.test(message))
        return result('TARGET_CLOSED');
    if (NOT_FOUND_RE.test(message))
        return result('NOT_FOUND');
    if (POLICY.test(message))
        return result('POLICY_DENIED');
    if (INVALID.test(message))
        return result('INVALID_ARGS', 'Check the arguments with browser_index({action}).');
    return result('ACTION_FAILED', 'The action failed; read the message, and re-observe the page before retrying side-effecting actions.');
}
//# sourceMappingURL=errors.js.map