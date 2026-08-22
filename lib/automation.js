/**
 * Bounded, auditable Playwright recipes for model-generated browser flows.
 * Recipes deliberately expose named operations instead of arbitrary JavaScript.
 * @module dsh-browser/automation
 */
const READ_ONLY_ACTIONS = new Set(['wait', 'extract', 'assert', 'screenshot']);
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
export function validateRecipe(steps) {
    if (steps.length < 1 || steps.length > 25)
        throw new Error('recipe must contain between 1 and 25 steps');
    for (const step of steps) {
        switch (step.type) {
            case 'wait': {
                finite(step.timeoutMs, 15_000, 0, 30_000, 'wait timeoutMs');
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
export async function runRecipe(page, steps, captureScreenshot, signal) {
    validateRecipe(steps);
    const results = [];
    for (let index = 0; index < steps.length; index += 1) {
        signal?.throwIfAborted();
        const step = steps[index];
        let value;
        switch (step.type) {
            case 'wait': {
                const timeout = finite(step.timeoutMs, 15_000, 0, 30_000, 'wait timeoutMs');
                if (step.condition === 'selector')
                    await page.locator(selector(step.value)).first().waitFor({ state: 'visible', timeout });
                else if (step.condition === 'text')
                    await page.getByText(shortText(step.value, 'wait text', 2_000), { exact: false }).first().waitFor({ state: 'visible', timeout });
                else if (step.condition === 'load')
                    await page.waitForLoadState('networkidle', { timeout });
                else
                    await page.waitForTimeout(finite(step.waitMs ?? Number(step.value ?? 0), 0, 0, 10_000, 'wait waitMs'));
                break;
            }
            case 'click':
                await page.locator(selector(step.selector)).first().click({ timeout: step.timeoutMs ?? 15_000 });
                break;
            case 'fill':
                await page.locator(selector(step.selector)).first().fill(step.value, { timeout: step.timeoutMs ?? 15_000 });
                break;
            case 'type':
                await page.locator(selector(step.selector)).first().pressSequentially(step.value, { timeout: step.timeoutMs ?? 15_000 });
                break;
            case 'press':
                if (step.selector)
                    await page.locator(selector(step.selector)).first().press(step.key);
                else
                    await page.keyboard.press(step.key);
                break;
            case 'select':
                await page.locator(selector(step.selector)).first().selectOption(step.value);
                break;
            case 'check': {
                const target = page.locator(selector(step.selector)).first();
                if (step.checked === false)
                    await target.uncheck();
                else
                    await target.check();
                break;
            }
            case 'hover':
                await page.locator(selector(step.selector)).first().hover();
                break;
            case 'scroll':
                await page.mouse.wheel(0, step.deltaY ?? 2_000);
                await page.waitForTimeout(step.waitMs ?? 400);
                break;
            case 'extract': {
                const target = page.locator(step.selector ?? 'body').first();
                const mode = step.mode ?? 'text';
                if (mode === 'text')
                    value = cap(await target.innerText());
                else if (mode === 'html')
                    value = cap(await target.innerHTML());
                else if (mode === 'attribute')
                    value = String(await target.getAttribute(shortText(step.attribute, 'attribute', 100)) ?? '');
                else {
                    const rows = await target.locator('a[href]').evaluateAll((anchors, limit) => anchors.slice(0, limit).map(anchor => ({
                        text: String(anchor.textContent ?? '').trim(),
                        url: String(anchor.href ?? ''),
                    })), step.limit ?? 100);
                    value = cap(JSON.stringify(rows));
                }
                break;
            }
            case 'assert': {
                const timeout = step.timeoutMs ?? 15_000;
                if (step.selector)
                    await page.locator(selector(step.selector)).first().waitFor({ state: 'visible', timeout });
                if (step.text)
                    await page.getByText(step.text, { exact: false }).first().waitFor({ state: 'visible', timeout });
                break;
            }
            case 'screenshot':
                value = await captureScreenshot();
                break;
        }
        results.push({ step: index + 1, action: step.type, ok: true, ...value !== undefined ? { value } : {} });
    }
    return results;
}
//# sourceMappingURL=automation.js.map