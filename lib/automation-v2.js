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
import { RecipeAssertionError, RecipeValidationError, isTimeoutError } from "./actions/errors.js";
import { resolveLocator, validateLocatorSpec, withStrictLocator } from "./locator.js";
export const WAIT_CONDITIONS_V2 = ['locator', 'text', 'url', 'load', 'time'];
export const STEP_TYPES_V2 = ['wait', 'click', 'fill', 'clear', 'type', 'press', 'select', 'check', 'hover', 'scroll', 'goto', 'extract', 'assert', 'screenshot'];
export const EXTRACT_MODES_V2 = ['text', 'html', 'links', 'attribute'];
export const INPUT_TYPES = ['string', 'number', 'enum'];
export const OUTPUT_TYPES = ['string', 'number', 'json'];
const NAME = /^[a-zA-Z][\w-]{0,39}$/;
const MAX_STEPS = 25;
const ALLOWED_FIELDS = {
    wait: ['condition', 'locator', 'value', 'waitMs', 'timeoutMs'],
    click: ['locator', 'timeoutMs'],
    hover: ['locator', 'timeoutMs'],
    fill: ['locator', 'value', 'allowEmpty', 'timeoutMs'],
    clear: ['locator', 'timeoutMs'],
    type: ['locator', 'value', 'timeoutMs'],
    press: ['key', 'locator', 'timeoutMs'],
    select: ['locator', 'value', 'timeoutMs'],
    check: ['locator', 'checked', 'timeoutMs'],
    scroll: ['deltaY', 'waitMs'],
    goto: ['url', 'timeoutMs'],
    extract: ['locator', 'mode', 'attribute', 'limit', 'as', 'timeoutMs'],
    assert: ['locator', 'text', 'urlIncludes', 'timeoutMs'],
    screenshot: [],
};
function finite(value, fallback, min, max, label) {
    const resolved = value ?? fallback;
    if (typeof resolved !== 'number' || !Number.isFinite(resolved) || resolved < min || resolved > max)
        throw new Error(label + ' must be between ' + min + ' and ' + max);
    return resolved;
}
function text(value, label, max) {
    if (typeof value !== 'string' || value.length === 0 || value.length > max)
        throw new Error(label + ' must contain 1 to ' + max + ' characters');
    return value;
}
function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
/** True when `host` is one of `domains` or a subdomain of one. */
export function hostInDomains(host, domains) {
    const lower = host.toLowerCase();
    return domains.some(domain => lower === domain.toLowerCase() || lower.endsWith('.' + domain.toLowerCase()));
}
function parseHttpUrl(value, label) {
    let parsed;
    try {
        parsed = new URL(value);
    }
    catch {
        throw new Error(`${label} must be an absolute http(s) URL`);
    }
    if (!['http:', 'https:'].includes(parsed.protocol))
        throw new Error(`${label} must be an absolute http(s) URL`);
    return parsed;
}
function gotoAllowed(url, options) {
    return (options.sameOrigin !== undefined && url.origin === options.sameOrigin) || hostInDomains(url.hostname, options.allowedDomains ?? []);
}
function describeAllowed(options) {
    const parts = [...options.allowedDomains ?? []];
    if (options.sameOrigin)
        parts.push('origin ' + options.sameOrigin);
    return parts.join(', ') || 'none declared';
}
/**
 * Refuse a recipe whose literal goto URLs leave the allowed domains, before any step runs.
 * Throws a message with "is not allowed on", which the shared mapping reports as POLICY_DENIED.
 */
export function assertGotoAllowed(steps, options) {
    steps.forEach((step, index) => {
        if (step?.type !== 'goto' || typeof step.url !== 'string')
            return;
        let parsed;
        try {
            parsed = new URL(step.url);
        }
        catch {
            return;
        } // malformed URLs are reported by validation
        if (!['http:', 'https:'].includes(parsed.protocol))
            return;
        if (!gotoAllowed(parsed, options))
            throw new Error(`recipe step ${index + 1}: goto ${parsed.hostname} is not allowed on this recipe (allowed: ${describeAllowed(options)}); nothing ran`);
    });
}
function checkLocator(value, label) {
    if (!isRecord(value))
        throw new Error(`${label} locator must be an object such as {"role":"button","name":"Save"} or {"css":"#id"}`);
    if ('selector' in value)
        throw new Error(`${label} locator uses "css" for a CSS selector in v2, not "selector"`);
    if ('frame' in value)
        throw new Error(`${label} locator uses "framePath" (iframe selectors, outermost first) in v2, not "frame"`);
    return validateLocatorSpec(value, `${label} locator`);
}
/** Structural validation of v2 steps. Throws a message the model can act on; nothing is run. */
export function validateRecipeV2(steps) {
    try {
        checkSteps(steps);
    }
    catch (error) {
        throw error instanceof RecipeValidationError ? error : new RecipeValidationError(error instanceof Error ? error.message : String(error));
    }
}
function checkSteps(steps) {
    if (!Array.isArray(steps) || steps.length < 1 || steps.length > MAX_STEPS)
        throw new Error(`recipe must contain between 1 and ${MAX_STEPS} steps`);
    const names = new Set();
    steps.forEach((raw, index) => {
        const label = 'recipe step ' + (index + 1);
        if (!isRecord(raw))
            throw new Error(label + ' must be an object');
        const step = raw;
        if (!STEP_TYPES_V2.includes(step.type))
            throw new Error(`${label}: unsupported step type ${JSON.stringify(step.type)}; v2 uses ${STEP_TYPES_V2.join(', ')}`);
        const allowed = ALLOWED_FIELDS[step.type];
        for (const key of Object.keys(step)) {
            if (key === 'type' || allowed.includes(key))
                continue;
            throw new Error(key === 'selector'
                ? `${label} (${step.type}): v2 steps locate with "locator" (for example {"css":"#id"}), not "selector"`
                : `${label} (${step.type}): unsupported field "${key}"; allowed: ${['type', ...allowed].join(', ')}`);
        }
        const where = `${label} (${step.type})`;
        if (step.timeoutMs !== undefined)
            finite(step.timeoutMs, 15_000, 1, 30_000, where + ' timeoutMs');
        switch (step.type) {
            case 'wait': {
                if (!WAIT_CONDITIONS_V2.includes(step.condition))
                    throw new Error(`${where}: unsupported wait condition ${JSON.stringify(step.condition)}; use one of ${WAIT_CONDITIONS_V2.join(', ')}`);
                if (step.condition === 'locator')
                    checkLocator(step.locator, where);
                else if (step.locator !== undefined)
                    throw new Error(`${where}: locator is only valid with condition "locator"`);
                if (step.condition === 'text')
                    text(step.value, where + ' value', 2_000);
                if (step.condition === 'url')
                    text(step.value, where + ' value', 2_000);
                if (step.condition === 'time')
                    finite(step.waitMs, 0, 0, 10_000, where + ' waitMs');
                break;
            }
            case 'click':
            case 'hover':
            case 'clear':
                checkLocator(step.locator, where);
                break;
            case 'fill': {
                checkLocator(step.locator, where);
                if (typeof step.value !== 'string')
                    throw new Error(`${where}: value must be a string`);
                if (step.value.length > 20_000)
                    throw new Error(`${where}: value must contain at most 20000 characters`);
                if (step.allowEmpty !== undefined && typeof step.allowEmpty !== 'boolean')
                    throw new Error(`${where}: allowEmpty must be a boolean`);
                if (step.value === '' && step.allowEmpty !== true)
                    throw new Error(`${where}: value is empty. Write allowEmpty: true to set an empty string on purpose, or use a clear step`);
                break;
            }
            case 'type':
                checkLocator(step.locator, where);
                text(step.value, where + ' value', 20_000);
                break;
            case 'press':
                text(step.key, where + ' key', 100);
                if (step.locator !== undefined)
                    checkLocator(step.locator, where);
                break;
            case 'select':
                checkLocator(step.locator, where);
                text(step.value, where + ' value', 2_000);
                break;
            case 'check':
                checkLocator(step.locator, where);
                break;
            case 'scroll':
                finite(step.deltaY, 2_000, -20_000, 20_000, where + ' deltaY');
                finite(step.waitMs, 400, 0, 5_000, where + ' waitMs');
                break;
            case 'goto':
                text(step.url, where + ' url', 2_000);
                if (!/\{\{/.test(step.url))
                    parseHttpUrl(step.url, where + ' url');
                break;
            case 'extract': {
                if (step.locator !== undefined)
                    checkLocator(step.locator, where);
                if (step.mode !== undefined && !EXTRACT_MODES_V2.includes(step.mode))
                    throw new Error(`${where}: unsupported extract mode ${JSON.stringify(step.mode)}; use one of ${EXTRACT_MODES_V2.join(', ')}`);
                finite(step.limit, 100, 1, 500, where + ' limit');
                if (step.mode === 'attribute')
                    text(step.attribute, where + ' attribute', 100);
                else if (step.attribute !== undefined)
                    throw new Error(`${where}: attribute is only valid with mode "attribute"`);
                if (step.as !== undefined) {
                    if (typeof step.as !== 'string' || !NAME.test(step.as))
                        throw new Error(`${where}: as must be a name of letters, digits, _ or - starting with a letter (max 40)`);
                    if (names.has(step.as))
                        throw new Error(`${where}: output name "${step.as}" is already used by an earlier extract`);
                    names.add(step.as);
                }
                break;
            }
            case 'assert': {
                if (step.locator === undefined && step.text === undefined && step.urlIncludes === undefined)
                    throw new Error(`${where}: assert needs locator, text, or urlIncludes`);
                if (step.locator !== undefined)
                    checkLocator(step.locator, where);
                if (step.text !== undefined)
                    text(step.text, where + ' text', 2_000);
                if (step.urlIncludes !== undefined)
                    text(step.urlIncludes, where + ' urlIncludes', 2_000);
                break;
            }
            case 'screenshot':
                break;
        }
    });
}
// --- asset-level fields -------------------------------------------------------
function placeholders(value, into) {
    if (typeof value === 'string')
        for (const match of value.matchAll(/\{\{([a-zA-Z][\w-]*)\}\}/g))
            into.add(match[1]);
    else if (Array.isArray(value))
        value.forEach(entry => placeholders(entry, into));
    else if (isRecord(value))
        Object.values(value).forEach(entry => placeholders(entry, into));
}
/** Every `{{name}}` used by the steps and postconditions. */
export function placeholderNames(...values) {
    const names = new Set();
    values.forEach(value => placeholders(value, names));
    return [...names];
}
export function normalizeInputSchema(raw) {
    if (!Array.isArray(raw) || raw.length > 20)
        throw new Error('inputSchema must be an array of at most 20 inputs');
    const seen = new Set();
    return raw.map((entry, index) => {
        const label = `inputSchema[${index}]`;
        if (!isRecord(entry))
            throw new Error(label + ' must be an object');
        for (const key of Object.keys(entry))
            if (!['name', 'type', 'required', 'example', 'enumValues', 'description'].includes(key))
                throw new Error(`${label} has an unsupported field "${key}"`);
        if (typeof entry.name !== 'string' || !NAME.test(entry.name))
            throw new Error(`${label}.name must be a name of letters, digits, _ or - starting with a letter (max 40)`);
        if (seen.has(entry.name))
            throw new Error(`${label}.name "${entry.name}" is declared twice`);
        seen.add(entry.name);
        if (!INPUT_TYPES.includes(entry.type))
            throw new Error(`${label}.type must be one of ${INPUT_TYPES.join(', ')}`);
        if (entry.required !== undefined && typeof entry.required !== 'boolean')
            throw new Error(`${label}.required must be a boolean`);
        const spec = { name: entry.name, type: entry.type };
        if (entry.required !== undefined)
            spec.required = entry.required;
        if (entry.description !== undefined)
            spec.description = text(entry.description, label + '.description', 200);
        if (entry.type === 'enum') {
            if (!Array.isArray(entry.enumValues) || entry.enumValues.length < 1 || entry.enumValues.length > 50)
                throw new Error(`${label}.enumValues must list 1 to 50 values for an enum input`);
            const values = entry.enumValues.map((value, at) => text(value, `${label}.enumValues[${at}]`, 200));
            if (new Set(values).size !== values.length)
                throw new Error(`${label}.enumValues contains duplicates`);
            spec.enumValues = values;
        }
        else if (entry.enumValues !== undefined)
            throw new Error(`${label}.enumValues is only valid for type enum`);
        if (entry.example !== undefined) {
            const example = entry.example;
            if (typeof example !== 'string' && typeof example !== 'number')
                throw new Error(`${label}.example must be a string or a number`);
            if (entry.type === 'number' && !Number.isFinite(Number(example)))
                throw new Error(`${label}.example must be numeric for a number input`);
            if (entry.type === 'enum' && !spec.enumValues.includes(String(example)))
                throw new Error(`${label}.example must be one of enumValues`);
            spec.example = example;
        }
        return spec;
    });
}
export function normalizeOutputSchema(raw, steps) {
    if (!Array.isArray(raw) || raw.length > 20)
        throw new Error('outputSchema must be an array of at most 20 outputs');
    const produced = new Set(steps.filter(step => step?.type === 'extract' && step.as).map(step => step.as));
    const seen = new Set();
    return raw.map((entry, index) => {
        const label = `outputSchema[${index}]`;
        if (!isRecord(entry))
            throw new Error(label + ' must be an object');
        for (const key of Object.keys(entry))
            if (!['name', 'type', 'description'].includes(key))
                throw new Error(`${label} has an unsupported field "${key}"`);
        if (typeof entry.name !== 'string' || !NAME.test(entry.name))
            throw new Error(`${label}.name must be a name of letters, digits, _ or - starting with a letter (max 40)`);
        if (seen.has(entry.name))
            throw new Error(`${label}.name "${entry.name}" is declared twice`);
        seen.add(entry.name);
        if (!OUTPUT_TYPES.includes(entry.type))
            throw new Error(`${label}.type must be one of ${OUTPUT_TYPES.join(', ')}`);
        if (!produced.has(entry.name))
            throw new Error(`${label}.name "${entry.name}" is not produced: add an extract step with as: "${entry.name}"`);
        return { name: entry.name, type: entry.type, ...entry.description !== undefined ? { description: text(entry.description, label + '.description', 200) } : {} };
    });
}
export function normalizePostconditions(raw, steps) {
    if (!Array.isArray(raw) || raw.length > 10)
        throw new Error('postconditions must be an array of at most 10 conditions');
    const produced = new Set(steps.filter(step => step?.type === 'extract' && step.as).map(step => step.as));
    return raw.map((entry, index) => {
        const label = `postconditions[${index}]`;
        if (!isRecord(entry))
            throw new Error(label + ' must be an object');
        const kinds = ['selector', 'text', 'urlIncludes', 'output'].filter(kind => entry[kind] !== undefined);
        if (kinds.length !== 1)
            throw new Error(`${label} needs exactly one of selector, text, urlIncludes, or output`);
        const kind = kinds[0];
        const allowed = kind === 'output' ? ['output', 'nonEmpty', 'allowEmpty'] : [kind, 'timeoutMs'];
        for (const key of Object.keys(entry))
            if (!allowed.includes(key))
                throw new Error(`${label} has an unsupported field "${key}" for ${kind}`);
        if (kind === 'output') {
            const name = text(entry.output, label + '.output', 40);
            if (!produced.has(name))
                throw new Error(`${label}.output "${name}" is not produced by any extract step with as: "${name}"`);
            const flags = [entry.nonEmpty === true, entry.allowEmpty === true].filter(Boolean).length;
            if (flags !== 1 || (entry.nonEmpty !== undefined && entry.nonEmpty !== true) || (entry.allowEmpty !== undefined && entry.allowEmpty !== true))
                throw new Error(`${label} for an output needs exactly one of nonEmpty: true or allowEmpty: true`);
            return entry.nonEmpty === true ? { output: name, nonEmpty: true } : { output: name, allowEmpty: true };
        }
        if (entry.timeoutMs !== undefined)
            finite(entry.timeoutMs, 5_000, 1, 30_000, label + '.timeoutMs');
        const value = text(entry[kind], `${label}.${kind}`, kind === 'selector' ? 500 : 2_000);
        return { [kind]: value, ...entry.timeoutMs !== undefined ? { timeoutMs: entry.timeoutMs } : {} };
    });
}
export function normalizeRequiredCapabilities(raw) {
    if (!Array.isArray(raw) || raw.length > 20)
        throw new Error('requiredCapabilities must be an array of at most 20 names');
    return [...new Set(raw.map((entry, index) => {
            const value = text(entry, `requiredCapabilities[${index}]`, 60);
            if (!/^[a-zA-Z0-9][\w.:-]*$/.test(value))
                throw new Error(`requiredCapabilities[${index}] must be a capability name such as act.fill or auth:profile`);
            return value;
        }))];
}
/** Steps whose locator still takes the first match without a reason: left by the v1 converter. */
export function pendingDisambiguation(steps) {
    const pending = [];
    steps.forEach((step, index) => {
        if (step?.locator?.explicitFirst)
            pending.push({ step: index + 1, action: step.type, kind: 'explicit-first', locator: structuredClone(step.locator) });
    });
    return pending;
}
/**
 * Validate caller inputs against the declared schema and convert them to the
 * strings placeholders are replaced with: numbers are parsed and canonicalized,
 * enums must be a listed value, an optional input left out becomes "".
 */
export function coerceInputs(schema, raw) {
    const given = isRecord(raw) ? raw : {};
    if (raw !== undefined && raw !== null && !isRecord(raw))
        throw new Error('automation inputs must be an object');
    if (Object.keys(given).length > 20 || Object.keys(given).some(key => !NAME.test(key)))
        throw new Error('automation inputs exceed key, count, or value limits');
    const declared = new Set(schema.map(spec => spec.name));
    const extra = Object.keys(given).filter(name => !declared.has(name));
    if (extra.length)
        throw new Error('undeclared automation inputs: ' + extra.join(', '));
    const out = {};
    const missing = [];
    for (const spec of schema) {
        const value = given[spec.name];
        if (value === undefined || value === null) {
            if (spec.required === false)
                out[spec.name] = '';
            else
                missing.push(spec.name);
            continue;
        }
        if (spec.type === 'number') {
            const parsed = typeof value === 'number' ? value : (typeof value === 'string' && value.trim() !== '' ? Number(value.trim()) : NaN);
            if (!Number.isFinite(parsed))
                throw new Error(`automation input "${spec.name}" must be a number (got ${JSON.stringify(value)})`);
            out[spec.name] = String(parsed);
        }
        else if (spec.type === 'enum') {
            const chosen = typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' ? String(value) : '';
            if (!spec.enumValues.includes(chosen))
                throw new Error(`automation input "${spec.name}" must be one of ${spec.enumValues.join(' | ')} (got ${JSON.stringify(value)})`);
            out[spec.name] = chosen;
        }
        else {
            if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean')
                throw new Error(`automation input "${spec.name}" must be a string`);
            out[spec.name] = String(value);
        }
        if (out[spec.name].length > 10_000)
            throw new Error('automation inputs exceed key, count, or value limits');
    }
    if (missing.length)
        throw new Error('missing declared automation inputs: ' + missing.join(', '));
    return out;
}
/** Replace `{{name}}` in every string of a step or postcondition. `type` and `indexReason` are never touched. */
export function materializeDeep(value, inputs) {
    const walk = (node, key) => {
        if (typeof node === 'string') {
            if (key === 'type' || key === 'indexReason')
                return node;
            return node.replace(/\{\{([a-zA-Z][\w-]*)\}\}/g, (_match, name) => {
                if (!(name in inputs))
                    throw new Error(`missing automation input: ${name}`);
                return inputs[name];
            });
        }
        if (Array.isArray(node))
            return node.map(entry => walk(entry));
        if (isRecord(node))
            return Object.fromEntries(Object.entries(node).map(([entryKey, entry]) => [entryKey, walk(entry, entryKey)]));
        return node;
    };
    return walk(value);
}
// --- running ------------------------------------------------------------------
function cap(value, max = 50_000) {
    return value.length <= max ? value : value.slice(0, max) + '\n…(truncated)';
}
/** Run one v2 step. Returns the value an extract or screenshot step produced. */
export async function runStepV2(page, step, ctx) {
    const act = (run) => {
        const timeout = step.timeoutMs ?? 15_000;
        return withStrictLocator(resolveLocator(page, step.locator), locator => run(locator, timeout));
    };
    switch (step.type) {
        case 'goto': {
            const target = parseHttpUrl(step.url, 'goto url');
            if (!gotoAllowed(target, ctx))
                throw new Error(`goto ${target.hostname} is not allowed on this recipe (allowed: ${describeAllowed(ctx)})`);
            if (!ctx.goto)
                throw new Error('goto is not available in this runner');
            await ctx.goto(target.href);
            // A redirect can leave the allowed domains after the request was made; the page must not be used from there.
            let landed;
            try {
                landed = new URL(page.url());
            }
            catch { /* about:blank and the like */ }
            if (landed && ['http:', 'https:'].includes(landed.protocol) && !gotoAllowed(landed, ctx))
                throw new Error(`goto landed on ${landed.hostname}, which is not allowed on this recipe (allowed: ${describeAllowed(ctx)})`);
            return undefined;
        }
        case 'wait': {
            const timeout = step.timeoutMs ?? 15_000;
            if (step.condition === 'locator')
                await withStrictLocator(resolveLocator(page, step.locator), locator => locator.waitFor({ state: 'visible', timeout }));
            else if (step.condition === 'text')
                await page.getByText(step.value, { exact: false }).first().waitFor({ state: 'visible', timeout });
            else if (step.condition === 'url')
                await page.waitForURL((url) => url.href.includes(step.value), { timeout });
            else if (step.condition === 'load')
                await page.waitForLoadState('networkidle', { timeout });
            else
                await page.waitForTimeout(step.waitMs ?? 0);
            return undefined;
        }
        case 'click':
            await act((locator, timeout) => locator.click({ timeout }));
            return undefined;
        case 'hover':
            await act((locator, timeout) => locator.hover({ timeout }));
            return undefined;
        case 'fill':
            await act((locator, timeout) => locator.fill(step.value, { timeout }));
            return undefined;
        case 'clear':
            await act((locator, timeout) => locator.clear({ timeout }));
            return undefined;
        case 'type':
            await act((locator, timeout) => locator.pressSequentially(step.value, { timeout }));
            return undefined;
        case 'press':
            if (step.locator)
                await act((locator, timeout) => locator.press(step.key, { timeout }));
            else
                await page.keyboard.press(step.key);
            return undefined;
        case 'select':
            await act((locator, timeout) => locator.selectOption(step.value, { timeout }));
            return undefined;
        case 'check':
            await act((locator, timeout) => step.checked === false ? locator.uncheck({ timeout }) : locator.check({ timeout }));
            return undefined;
        case 'scroll':
            await page.mouse.wheel(0, step.deltaY ?? 2_000);
            await page.waitForTimeout(step.waitMs ?? 400);
            return undefined;
        case 'extract': {
            // Default 5 s instead of the 30 s page default: a selector that is not there fails fast (LOCATOR_NOT_FOUND).
            const timeout = step.timeoutMs ?? 5_000;
            const mode = step.mode ?? 'text';
            const run = async (target) => {
                if (mode === 'text')
                    return cap(await target.innerText({ timeout }));
                if (mode === 'html')
                    return cap(await target.innerHTML({ timeout }));
                if (mode === 'attribute')
                    return String(await target.getAttribute(step.attribute, { timeout }) ?? '');
                // links: the container must exist (evaluateAll alone would turn a missing container into an empty list).
                await target.waitFor({ state: 'attached', timeout });
                const rows = await target.locator('a[href]').evaluateAll(new Function('anchors', 'limit', 'return anchors.slice(0, limit).map(function (anchor) { return { text: String(anchor.textContent || "").trim(), url: String(anchor.href || "") } })'), step.limit ?? 100);
                return cap(JSON.stringify(rows));
            };
            if (step.locator)
                return withStrictLocator(resolveLocator(page, step.locator), run);
            return run(page.locator('body'));
        }
        case 'assert': {
            const timeout = step.timeoutMs ?? 5_000;
            try {
                if (step.locator)
                    await withStrictLocator(resolveLocator(page, step.locator), locator => locator.waitFor({ state: 'visible', timeout }));
                if (step.text)
                    await page.getByText(step.text, { exact: false }).first().waitFor({ state: 'visible', timeout });
                if (step.urlIncludes)
                    await page.waitForURL((url) => url.href.includes(step.urlIncludes), { timeout });
            }
            catch (error) {
                // Only "never became true" is a failed assertion; ambiguity, a closed page or a bad locator keep their own cause.
                if (!isTimeoutError(error))
                    throw error;
                const expected = [step.locator ? 'locator ' + JSON.stringify(step.locator) : '', step.text ? 'text ' + JSON.stringify(step.text) : '', step.urlIncludes ? 'url containing ' + JSON.stringify(step.urlIncludes) : ''].filter(Boolean).join(' and ');
                throw new RecipeAssertionError('assert failed: ' + expected + ' did not become true within ' + timeout + 'ms. ' + (error instanceof Error ? error.message : String(error)));
            }
            return undefined;
        }
        case 'screenshot':
            return ctx.captureScreenshot();
    }
}
/** Turn an extracted string into the declared output type. Returns the typed value, or a problem description. */
export function coerceOutput(spec, value) {
    if (spec.type === 'string')
        return typeof value === 'string' ? { ok: true, value } : { ok: false, problem: `output "${spec.name}" should be a string` };
    const raw = typeof value === 'string' ? value : JSON.stringify(value);
    if (spec.type === 'number') {
        const parsed = Number(raw.trim().replace(/,/g, ''));
        return raw.trim() !== '' && Number.isFinite(parsed) ? { ok: true, value: parsed } : { ok: false, problem: `output "${spec.name}" is not a number: ${JSON.stringify(raw.slice(0, 80))}` };
    }
    try {
        return { ok: true, value: JSON.parse(raw) };
    }
    catch {
        return { ok: false, problem: `output "${spec.name}" is not valid JSON: ${JSON.stringify(raw.slice(0, 80))}` };
    }
}
function isEmptyValue(value) {
    if (value === null || value === undefined)
        return true;
    if (typeof value === 'string')
        return value.trim().length === 0;
    if (Array.isArray(value))
        return value.length === 0;
    if (isRecord(value))
        return Object.keys(value).length === 0;
    return false;
}
/** Check every postcondition; a condition that does not hold is described, never thrown. */
export async function evaluatePostconditions(page, conditions, outputs, signal) {
    const failures = [];
    for (const [index, condition] of conditions.entries()) {
        if (signal?.aborted)
            break;
        const label = `postcondition ${index + 1} ${JSON.stringify(condition)}`;
        if ('output' in condition) {
            const produced = outputs.find(output => output.name === condition.output);
            if (!produced)
                failures.push(`${label}: output "${condition.output}" was not produced`);
            else if (condition.nonEmpty && isEmptyValue(produced.value))
                failures.push(`${label}: output "${condition.output}" is empty`);
            continue;
        }
        const timeout = condition.timeoutMs ?? 5_000;
        try {
            if ('selector' in condition)
                await page.locator(condition.selector).first().waitFor({ state: 'visible', timeout });
            else if ('text' in condition)
                await page.getByText(condition.text, { exact: false }).first().waitFor({ state: 'visible', timeout });
            else
                await page.waitForURL((url) => url.href.includes(condition.urlIncludes), { timeout });
        }
        catch (error) {
            if (!isTimeoutError(error))
                return { failures, error };
            failures.push(`${label}: did not hold within ${timeout}ms. ${(error instanceof Error ? error.message : String(error)).split('\n')[0]}`);
        }
    }
    return { failures };
}
//# sourceMappingURL=automation-v2.js.map