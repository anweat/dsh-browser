/**
 * Bounded, auditable Playwright recipes for model-generated browser flows.
 * Recipes deliberately expose named operations instead of arbitrary JavaScript.
 * @module dsh-browser/automation
 */
import { RecipeAssertionError, RecipeValidationError, abortedByDeadline, isTimeoutError, mapError } from "./actions/errors.js";
export const WAIT_CONDITIONS = ['selector', 'text', 'load', 'time'];
export const EXTRACT_MODES = ['text', 'html', 'links', 'attribute'];
const READ_ONLY_ACTIONS = new Set(['wait', 'extract', 'assert', 'screenshot']);
/** Steps that change page or remote state. A failure here may have partly taken effect. */
const EFFECT_ACTIONS = new Set(['fill', 'type', 'click', 'press', 'select', 'check']);
function finite(value, fallback, min, max, label) {
    const resolved = value ?? fallback;
    if (!Number.isFinite(resolved) || resolved < min || resolved > max)
        throw new Error(label + ' must be between ' + min + ' and ' + max);
    return resolved;
}
function selector(value) {
    if (!value || value.length > 500)
        throw new Error('selector must contain 1 to 500 characters');
    return value;
}
function shortText(value, label, max = 20_000) {
    if (value === undefined || value.length === 0 || value.length > max)
        throw new Error(label + ' must contain 1 to ' + max + ' characters');
    return value;
}
/**
 * Reject enum values the runner does not implement. Used by `validateRecipe`
 * and by the asset store when a draft is saved, so an unknown value never
 * reaches storage.
 */
export function validateRecipeEnums(steps, options = {}) {
    steps.forEach((step, index) => {
        const label = 'recipe step ' + (index + 1);
        if (step?.type === 'wait' && !WAIT_CONDITIONS.includes(step.condition))
            throw new RecipeValidationError(label + ': unsupported wait condition ' + JSON.stringify(step.condition) + '; use one of ' + WAIT_CONDITIONS.join(', '));
        if (!options.legacy && step?.type === 'extract' && step.mode !== undefined && !EXTRACT_MODES.includes(step.mode))
            throw new RecipeValidationError(label + ': unsupported extract mode ' + JSON.stringify(step.mode) + '; use one of ' + EXTRACT_MODES.join(', '));
    });
}
/** Extract steps whose mode is not in the enum; they ran as `links` before enum validation existed. */
function hasLegacyExtractMode(steps) {
    return steps.some(step => step.type === 'extract' && step.mode !== undefined && !EXTRACT_MODES.includes(step.mode));
}
export function validateRecipe(steps, options = {}) {
    try {
        validateRecipeShape(steps, options);
    }
    catch (error) {
        throw error instanceof RecipeValidationError ? error : new RecipeValidationError(error instanceof Error ? error.message : String(error));
    }
}
function validateRecipeShape(steps, options) {
    if (steps.length < 1 || steps.length > 25)
        throw new Error('recipe must contain between 1 and 25 steps');
    // A stored v1 asset may carry an unknown extract mode; it keeps running through the old branch.
    if (!options.legacy)
        validateRecipeEnums(steps);
    else
        for (const step of steps)
            if (step.type === 'wait')
                validateRecipeEnums([step]);
    for (const step of steps) {
        switch (step.type) {
            case 'wait': {
                if (!WAIT_CONDITIONS.includes(step.condition))
                    throw new Error('unsupported wait condition');
                finite(step.timeoutMs, 15_000, 1, 30_000, 'wait timeoutMs');
                if (step.condition === 'selector')
                    selector(step.value);
                else if (step.condition === 'text')
                    shortText(step.value, 'wait text', 2_000);
                else if (step.condition === 'time')
                    finite(step.waitMs ?? Number(step.value ?? 0), 0, 0, 10_000, 'wait waitMs');
                break;
            }
            case 'click':
                selector(step.selector);
                finite(step.timeoutMs, 15_000, 1, 30_000, 'click timeoutMs');
                break;
            case 'fill':
            case 'type':
                selector(step.selector);
                shortText(step.value, step.type + ' value');
                finite(step.timeoutMs, 15_000, 1, 30_000, step.type + ' timeoutMs');
                break;
            case 'press':
                shortText(step.key, 'key', 100);
                if (step.selector !== undefined)
                    selector(step.selector);
                break;
            case 'select':
                selector(step.selector);
                shortText(step.value, 'select value', 2_000);
                break;
            case 'check':
            case 'hover':
                selector(step.selector);
                break;
            case 'scroll':
                finite(step.deltaY, 2_000, -20_000, 20_000, 'scroll deltaY');
                finite(step.waitMs, 400, 0, 5_000, 'scroll waitMs');
                break;
            case 'extract':
                if (step.selector !== undefined)
                    selector(step.selector);
                finite(step.limit, 100, 1, 500, 'extract limit');
                if (step.mode === 'attribute')
                    shortText(step.attribute, 'attribute', 100);
                break;
            case 'assert':
                if (step.selector === undefined && step.text === undefined)
                    throw new Error('assert requires selector or text');
                if (step.selector !== undefined)
                    selector(step.selector);
                if (step.text !== undefined)
                    shortText(step.text, 'assert text', 2_000);
                finite(step.timeoutMs, 15_000, 1, 30_000, 'assert timeoutMs');
                break;
            case 'screenshot':
                break;
            default:
                throw new Error('unsupported recipe step');
        }
    }
}
export function recipeNeedsApproval(steps) {
    return steps.some(step => !READ_ONLY_ACTIONS.has(step.type));
}
function cap(value, max = 50_000) {
    return value.length <= max ? value : value.slice(0, max) + '\n…(truncated)';
}
/** Run one step against the page. Returns the value an extract or screenshot step produced. */
async function runStep(page, step, captureScreenshot) {
    switch (step.type) {
        case 'wait': {
            const timeout = finite(step.timeoutMs, 15_000, 1, 30_000, 'wait timeoutMs');
            if (step.condition === 'selector')
                await page.locator(selector(step.value)).first().waitFor({ state: 'visible', timeout });
            else if (step.condition === 'text')
                await page.getByText(shortText(step.value, 'wait text', 2_000), { exact: false }).first().waitFor({ state: 'visible', timeout });
            else if (step.condition === 'load')
                await page.waitForLoadState('networkidle', { timeout });
            else
                await page.waitForTimeout(finite(step.waitMs ?? Number(step.value ?? 0), 0, 0, 10_000, 'wait waitMs'));
            return undefined;
        }
        case 'click':
            await page.locator(selector(step.selector)).first().click({ timeout: step.timeoutMs ?? 15_000 });
            return undefined;
        case 'fill':
            await page.locator(selector(step.selector)).first().fill(step.value, { timeout: step.timeoutMs ?? 15_000 });
            return undefined;
        case 'type':
            await page.locator(selector(step.selector)).first().pressSequentially(step.value, { timeout: step.timeoutMs ?? 15_000 });
            return undefined;
        case 'press':
            if (step.selector)
                await page.locator(selector(step.selector)).first().press(step.key);
            else
                await page.keyboard.press(step.key);
            return undefined;
        case 'select':
            await page.locator(selector(step.selector)).first().selectOption(step.value);
            return undefined;
        case 'check': {
            const target = page.locator(selector(step.selector)).first();
            if (step.checked === false)
                await target.uncheck();
            else
                await target.check();
            return undefined;
        }
        case 'hover':
            await page.locator(selector(step.selector)).first().hover();
            return undefined;
        case 'scroll':
            await page.mouse.wheel(0, step.deltaY ?? 2_000);
            await page.waitForTimeout(step.waitMs ?? 400);
            return undefined;
        case 'extract': {
            // A missing element times out in innerText (LOCATOR_NOT_FOUND); an element that exists but is empty yields '' and the step completes.
            const target = page.locator(step.selector ?? 'body').first();
            const mode = step.mode ?? 'text';
            if (mode === 'text')
                return cap(await target.innerText());
            if (mode === 'html')
                return cap(await target.innerHTML());
            if (mode === 'attribute')
                return String(await target.getAttribute(shortText(step.attribute, 'attribute', 100)) ?? '');
            // `links`, and any unknown mode of a stored v1 asset (legacyFallback).
            const rows = await target.locator('a[href]').evaluateAll((anchors, limit) => anchors.slice(0, limit).map(anchor => ({
                text: String(anchor.textContent ?? '').trim(),
                url: String(anchor.href ?? ''),
            })), step.limit ?? 100);
            return cap(JSON.stringify(rows));
        }
        case 'assert': {
            const timeout = step.timeoutMs ?? 15_000;
            try {
                if (step.selector)
                    await page.locator(selector(step.selector)).first().waitFor({ state: 'visible', timeout });
                if (step.text)
                    await page.getByText(step.text, { exact: false }).first().waitFor({ state: 'visible', timeout });
            }
            catch (error) {
                // Only "never became true" is a failed assertion; a closed page or a bad selector keeps its own cause.
                if (!isTimeoutError(error))
                    throw error;
                const expected = [step.selector ? 'selector ' + JSON.stringify(step.selector) : '', step.text ? 'text ' + JSON.stringify(step.text) : ''].filter(Boolean).join(' and ');
                throw new RecipeAssertionError('assert failed: ' + expected + ' did not become visible within ' + timeout + 'ms. ' + (error instanceof Error ? error.message : String(error)));
            }
            return undefined;
        }
        case 'screenshot':
            return captureScreenshot();
    }
}
/**
 * Run the steps in order and report what happened as a value.
 *
 * Cancellation is checked before every step and once more after the last one.
 * A step already running cannot be interrupted (Playwright offers no way to do
 * that without closing the page), so a cancel takes effect when that step
 * returns; nothing is rolled back. A malformed recipe still throws
 * {@link RecipeValidationError} before any step runs.
 */
export async function runRecipe(page, steps, captureScreenshot, signal, options = {}) {
    validateRecipe(steps, options);
    const completedSteps = [];
    const outputs = [];
    const assertTotal = steps.filter(step => step.type === 'assert').length;
    let assertPassed = 0;
    let assertFailed = false;
    let effectsObserved = false;
    let effectsUnknown = false;
    const legacyFallback = options.legacy === true && hasLegacyExtractMode(steps);
    const finish = (executionStatus, failedStep, message) => ({
        executionStatus,
        validationStatus: assertFailed ? 'failed' : (assertTotal > 0 && assertPassed === assertTotal ? 'passed' : 'not_checked'),
        completedSteps,
        ...failedStep ? { failedStep } : {},
        effects: effectsUnknown ? 'unknown' : (effectsObserved ? 'observed' : 'none'),
        outputs,
        ...message ? { message } : {},
        ...legacyFallback ? { legacyFallback: true } : {},
    });
    /** A stop requested from outside: the user cancelled, or the overall deadline expired. */
    const stopped = (index) => {
        const byDeadline = abortedByDeadline(signal);
        const where = index === undefined ? 'after the last step' : 'before step ' + (index + 1) + ' (' + steps[index].type + ')';
        const message = (byDeadline ? 'The overall deadline expired ' : 'Cancelled ') + where + '; ' + completedSteps.length + ' of ' + steps.length + ' steps ran and are not rolled back.';
        const failedStep = index === undefined ? undefined
            : { index: index + 1, action: steps[index].type, errorCode: byDeadline ? 'DEADLINE' : 'CANCELLED', message };
        return finish(byDeadline ? 'failed' : 'cancelled', failedStep, message);
    };
    for (let index = 0; index < steps.length; index += 1) {
        if (signal?.aborted)
            return stopped(index);
        const step = steps[index];
        let value;
        try {
            value = await runStep(page, step, captureScreenshot);
        }
        catch (error) {
            const body = mapError(error, 'recipe.step', { signal });
            const effectful = EFFECT_ACTIONS.has(step.type);
            if (step.type === 'assert' && body.code === 'VALIDATION_FAILED')
                assertFailed = true;
            // The action may have partly happened unless the failure proves it was never attempted.
            if (effectful && body.code !== 'LOCATOR_AMBIGUOUS' && body.code !== 'INVALID_RECIPE')
                effectsUnknown = true;
            const failedStep = { index: index + 1, action: step.type, errorCode: body.code, message: body.message };
            const summary = 'Step ' + (index + 1) + ' (' + step.type + ') failed with ' + body.code + '; ' + completedSteps.length + ' earlier steps ran and are not rolled back.';
            if (body.code === 'CANCELLED')
                return finish('cancelled', failedStep, summary);
            if (effectful && isTimeoutError(error))
                return finish('outcome_unknown', failedStep, summary + ' The side-effecting step timed out, so its outcome is unknown.');
            return finish('failed', failedStep, summary);
        }
        if (EFFECT_ACTIONS.has(step.type))
            effectsObserved = true;
        if (step.type === 'assert')
            assertPassed += 1;
        if (value !== undefined && (step.type === 'extract' || step.type === 'screenshot'))
            outputs.push({ step: index + 1, action: step.type, value });
        completedSteps.push({ step: index + 1, action: step.type, ok: true, ...value !== undefined ? { value } : {} });
    }
    if (signal?.aborted)
        return stopped(undefined);
    return finish('completed');
}
//# sourceMappingURL=automation.js.map