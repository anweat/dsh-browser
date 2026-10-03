/**
 * Structured page observation behind `observe.read` sections.
 *
 * The in-page scan (`observe-script.ts`) reads the DOM; this module turns its output into the
 * model-facing record:
 *
 * - every listed element gets a candidate LocatorSpec that was CHECKED against the live page: it matches
 *   that element and no other (`locator`), or, when no candidate is unique, the best one is returned with
 *   `ambiguous: true`, how many elements it matches, and the element's position among them (`nth`);
 * - the whole result is fitted to a byte budget by dropping whole items or text from the end, so the JSON
 *   is always valid and `truncation` says what was left out.
 *
 * A property that was not observed is absent: `false` always means "observed, and not so".
 * @module dsh-browser/observe
 */
import { OBSERVE_MAX_FRAMES, OBSERVE_MAX_FRAME_DEPTH, OBSERVE_SOURCE, IDENTITY_SOURCE } from "./observe-script.js";
import { resolveLocator, validateLocatorSpec, withStrictLocator } from "./locator.js";
export const OBSERVE_SECTIONS = ['content', 'controls', 'links', 'tables'];
export const OBSERVE_DEFAULT_ITEMS = 50;
export const OBSERVE_MAX_ITEMS = 500;
export const OBSERVE_DEFAULT_BYTES = 24_000;
export const OBSERVE_MIN_BYTES = 2_000;
export const OBSERVE_MAX_BYTES = 90_000;
export class ObserveArgError extends Error {
    constructor(message) {
        super(message);
        this.name = 'ObserveArgError';
    }
}
/** Check and complete the raw arguments (the registry validated their types already). */
export function normalizeObserve(raw) {
    const sections = [...new Set(raw.sections ?? ['content'])];
    if (!sections.length)
        throw new ObserveArgError('sections must list at least one of content, controls, links, tables');
    for (const section of sections)
        if (!OBSERVE_SECTIONS.includes(section))
            throw new ObserveArgError(`unknown section "${section}"; use content, controls, links, or tables`);
    const maxItems = raw.maxItems ?? OBSERVE_DEFAULT_ITEMS;
    if (!Number.isInteger(maxItems) || maxItems < 1 || maxItems > OBSERVE_MAX_ITEMS)
        throw new ObserveArgError(`maxItems must be an integer from 1 to ${OBSERVE_MAX_ITEMS}`);
    const maxBytes = raw.maxBytes ?? OBSERVE_DEFAULT_BYTES;
    if (!Number.isInteger(maxBytes) || maxBytes < OBSERVE_MIN_BYTES || maxBytes > OBSERVE_MAX_BYTES)
        throw new ObserveArgError(`maxBytes must be an integer from ${OBSERVE_MIN_BYTES} to ${OBSERVE_MAX_BYTES}`);
    const region = raw.region;
    if (region) {
        const { x, y, width, height } = region;
        if (![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0)
            throw new ObserveArgError('region must be {x, y, width, height} in viewport pixels with a positive width and height');
    }
    const timeoutMs = raw.timeoutMs ?? 15_000;
    if (!Number.isFinite(timeoutMs) || timeoutMs < 1 || timeoutMs > 30_000)
        throw new ObserveArgError('timeoutMs must be between 1 and 30,000 ms');
    return {
        sections,
        ...raw.target !== undefined ? { target: raw.target } : {},
        ...region ? { region } : {},
        maxItems, maxBytes, includeValues: raw.includeValues === true, timeoutMs,
    };
}
function scopeBase(target) {
    if (target === undefined)
        return { framePath: [] };
    const spec = validateLocatorSpec(typeof target === 'string' ? { selector: target } : target);
    if (spec.framePath)
        return { framePath: [...spec.framePath] };
    if (spec.frame?.selector)
        return { framePath: [spec.frame.selector] };
    if (spec.frame)
        return { framePath: [], frame: spec.frame };
    return { framePath: [] };
}
/** Run the in-page scan on the whole document, or on the one element a strict locator names. */
export async function scanPage(page, request, base) {
    const options = {
        controls: request.sections.includes('controls'),
        links: request.sections.includes('links'),
        tables: request.sections.includes('tables'),
        maxItems: request.maxItems,
        includeValues: request.includeValues,
        ...request.region ? { region: request.region } : {},
        maxFrameDepth: Math.max(0, OBSERVE_MAX_FRAME_DEPTH - base.framePath.length),
        maxFrames: OBSERVE_MAX_FRAMES,
        // A frame addressed by name or url cannot be extended with nested framePath entries.
        noFrames: base.frame !== undefined,
    };
    if (request.target === undefined)
        return await page.evaluate(`(${OBSERVE_SOURCE})(document, ${JSON.stringify(options)})`);
    const locator = resolveLocator(page, request.target);
    // The function text is turned into a real Function so Playwright serializes it as a function, not an expression.
    const run = new Function('el', 'opts', `return (${OBSERVE_SOURCE})(el, opts)`);
    return await withStrictLocator(locator, l => l.evaluate(run, options, { timeout: request.timeoutMs }));
}
const IDENTITY = new Function('els', `return (${IDENTITY_SOURCE})(els)`);
function fullSpec(candidate, path, base) {
    const framePath = [...base.framePath, ...path];
    return {
        ...candidate,
        ...framePath.length ? { framePath } : {},
        ...base.frame ? { frame: base.frame } : {},
    };
}
/**
 * Pick the first candidate that matches exactly the element with this number. A candidate matching more
 * elements is remembered (fewest matches wins) and returned flagged `ambiguous` if no candidate is unique.
 */
async function bind(page, id, candidates, path, base) {
    let best;
    for (const candidate of candidates ?? []) {
        let spec;
        let ids;
        try {
            spec = fullSpec(candidate, path, base);
            ids = await resolveLocator(page, spec).evaluateAll(IDENTITY);
        }
        catch {
            continue;
        }
        const at = ids.indexOf(id);
        if (at < 0)
            continue;
        if (ids.length === 1)
            return { locator: spec };
        if (!best || ids.length < best.matches)
            best = { spec, matches: ids.length, nth: at };
    }
    return best ? { locator: best.spec, ambiguous: true, matches: best.matches, nth: best.nth } : { ambiguous: true };
}
/** Bind with a small pool and a time limit; whatever is not reached in time stays unbound and is reported. */
async function bindAll(items, job, deadline) {
    let cursor = 0;
    let skipped = 0;
    const worker = async () => {
        while (cursor < items.length) {
            const item = items[cursor++];
            if (Date.now() > deadline) {
                skipped += 1;
                continue;
            }
            await job(item);
        }
    };
    await Promise.all(Array.from({ length: Math.min(6, items.length) }, worker));
    return skipped;
}
function locatorFields(binding) {
    return {
        ...binding.locator ? { locator: binding.locator } : {},
        ...binding.ambiguous ? { ambiguous: true } : {},
        ...binding.matches !== undefined ? { matches: binding.matches, nth: binding.nth } : {},
    };
}
/** Check every candidate on the live page and build the records. */
export async function describeScan(page, raw, request, base) {
    const deadline = Date.now() + 12_000;
    let skipped = 0;
    // `unverified` marks an item whose locator was not checked because the time ran out.
    const pending = (binding) => binding ? locatorFields(binding) : { unverified: true };
    const controls = [];
    if (request.sections.includes('controls')) {
        const bound = raw.controls.map(control => ({ control, binding: undefined, options: undefined }));
        skipped += await bindAll(bound, async (entry) => {
            const { control } = entry;
            if (control.role === 'radiogroup') {
                entry.options = [];
                for (const option of control.options ?? [])
                    entry.options.push(option.id !== undefined ? await bind(page, option.id, option.cands, control.path, base) : undefined);
                entry.binding = {};
            }
            else if (control.id !== undefined)
                entry.binding = await bind(page, control.id, control.cands, control.path, base);
        }, deadline);
        for (const { control, binding, options: optionBindings } of bound) {
            const options = control.role === 'radiogroup'
                ? (control.options ?? []).map((option, index) => ({
                    label: option.label, value: option.value, checked: option.checked === true, ...option.disabled ? { disabled: true } : {}, ...pending(optionBindings?.[index]),
                }))
                : control.options;
            controls.push({
                ...control.role ? { role: control.role } : {},
                ...control.name ? { name: control.name } : {},
                ...control.type ? { type: control.type } : {},
                ...control.role === 'radiogroup' ? {} : pending(binding),
                actions: control.actions,
                ...control.visible !== undefined ? { visible: control.visible } : {},
                ...control.disabled !== undefined ? { disabled: control.disabled } : {},
                ...control.readonly !== undefined ? { readonly: control.readonly } : {},
                ...control.checked !== undefined ? { checked: control.checked } : {},
                ...control.expanded !== undefined ? { expanded: control.expanded } : {},
                ...control.hasValue !== undefined ? { hasValue: control.hasValue } : {},
                ...control.value !== undefined ? { value: control.value } : {},
                ...control.sensitive ? { sensitive: true } : {},
                ...options ? { options } : {},
                ...control.optionsTotal !== undefined ? { optionsTotal: control.optionsTotal } : {},
                ...control.constraints ? { constraints: control.constraints } : {},
                ...control.validity ? { validity: control.validity } : {},
                source: control.source,
            });
        }
    }
    const links = [];
    if (request.sections.includes('links')) {
        const bound = raw.links.map(link => ({ link, binding: undefined }));
        skipped += await bindAll(bound, async (entry) => { entry.binding = await bind(page, entry.link.id, entry.link.cands, entry.link.path, base); }, deadline);
        for (const { link, binding } of bound) {
            links.push({ text: link.text, href: link.href, ...pending(binding), visible: link.visible, ...link.target ? { target: link.target } : {} });
        }
    }
    const tables = [];
    if (request.sections.includes('tables')) {
        const bound = raw.tables.map(table => ({ table, binding: undefined }));
        skipped += await bindAll(bound, async (entry) => { entry.binding = await bind(page, entry.table.id, entry.table.cands, entry.table.path, base); }, deadline);
        for (const { table, binding } of bound) {
            tables.push({
                ...table.name ? { name: table.name } : {},
                ...pending(binding),
                headers: table.headers, rows: table.rows, totalRows: table.totalRows,
                ...table.declaredRows !== undefined ? { declaredRows: table.declaredRows } : {},
                coverage: table.coverage,
                ...table.reason ? { reason: table.reason } : {},
            });
        }
    }
    const limits = [];
    if (skipped)
        limits.push(`locator checking ran out of time: ${skipped} item(s) are listed without a checked locator (unverified: true)`);
    const crossOrigin = raw.frames.filter(frame => frame.crossOrigin).length;
    if (crossOrigin)
        limits.push(`${crossOrigin} cross-origin or sandboxed iframe(s) are listed in frames but their content is not observed; act.* can still reach into one with its framePath if you know the element`);
    if (raw.frames.some(frame => frame.skipped))
        limits.push('some iframes were not entered (nesting or count limit)');
    if (raw.framesOmitted)
        limits.push(`${raw.framesOmitted} more iframe(s) were neither listed nor entered`);
    return {
        ...request.sections.includes('controls') ? { controls } : {},
        ...request.sections.includes('links') ? { links } : {},
        ...request.sections.includes('tables') ? { tables } : {},
        ...raw.frames.length ? { frames: raw.frames.map(frame => ({ ...frame })) } : {},
        counts: {
            ...request.sections.includes('controls') ? { controls: raw.counts.controls } : {},
            ...request.sections.includes('links') ? { links: raw.counts.links } : {},
            ...request.sections.includes('tables') ? { tables: raw.counts.tables } : {},
        },
        limits,
    };
}
export { scopeBase };
// ---- fitting to a byte budget ---------------------------------------------------------------------
const bytes = (value) => Buffer.byteLength(JSON.stringify(value));
const TRUNCATION_RESERVE = 420;
/** Drop the last characters of a string without splitting a surrogate pair. */
function cutText(text, drop) {
    let end = Math.max(0, text.length - drop);
    if (end > 0 && end < text.length && /[\ud800-\udbff]/.test(text[end - 1]))
        end -= 1;
    return text.slice(0, end);
}
/**
 * Shrink the sections until the serialized record fits `maxBytes`. The largest section is shaved first,
 * a step at a time, so the budget ends up shared instead of one section taking all of it. Items and rows
 * are dropped whole and text is cut at a character, so the JSON stays valid. `found` is how many items
 * the page had per section before maxItems applied.
 */
export function fitObservation(input, maxBytes, found, maxItems) {
    let text = input.text;
    const lists = {
        frames: Array.isArray(input.head.frames) ? [...input.head.frames] : undefined,
        controls: input.controls ? [...input.controls] : undefined,
        links: input.links ? [...input.links] : undefined,
        tables: input.tables ? input.tables.map(table => ({ ...table, rows: [...table.rows] })) : undefined,
    };
    const droppedText = { chars: 0 };
    const compose = () => ({
        ...input.head,
        ...lists.frames ? { frames: lists.frames } : {},
        ...text !== undefined ? { text } : {},
        ...lists.controls ? { controls: lists.controls } : {},
        ...lists.links ? { links: lists.links } : {},
        ...lists.tables ? { tables: lists.tables } : {},
    });
    const byBytes = new Set();
    const byItems = new Set();
    for (const name of ['controls', 'links', 'tables']) {
        const total = found[name];
        if (lists[name] && total !== undefined && total > lists[name].length)
            byItems.add(name);
    }
    const tableRowsAtItems = (lists.tables ?? []).reduce((sum, table) => sum + Math.max(0, Number(table.totalRows) - table.rows.length), 0);
    if (tableRowsAtItems > 0)
        byItems.add('tables');
    // Room kept for the `truncation` member the caller adds when anything was left out.
    const budget = maxBytes - TRUNCATION_RESERVE;
    for (let guard = 0; guard < 2_000; guard += 1) {
        const total = bytes(compose());
        if (total <= budget)
            break;
        const over = total - budget;
        // Section sizes, largest first.
        const sizes = [];
        if (text !== undefined && text.length > 0)
            sizes.push({ name: 'content', size: bytes(text) });
        for (const name of ['controls', 'links', 'tables'])
            if (lists[name]?.length)
                sizes.push({ name, size: bytes(lists[name]) });
        // The frame list is the last thing to give up: it explains what was not covered.
        if (!sizes.length && lists.frames?.length)
            sizes.push({ name: 'frames', size: bytes(lists.frames) });
        if (!sizes.length)
            break;
        sizes.sort((a, b) => b.size - a.size);
        const target = sizes[0];
        const step = Math.min(over, Math.max(300, Math.ceil(target.size * 0.15)));
        byBytes.add(target.name);
        if (target.name === 'content') {
            const before = text.length;
            text = cutText(text, step);
            droppedText.chars += before - text.length;
            continue;
        }
        const list = lists[target.name];
        let freed = 0;
        while (freed < step && list.length) {
            if (target.name === 'tables') {
                // Rows of the table that has the most go first; a table with no rows left goes whole.
                const widest = list.reduce((best, table) => table.rows.length > best.rows.length ? table : best, list[0]);
                const rows = widest.rows;
                if (rows.length) {
                    freed += bytes(rows.pop()) + 1;
                    continue;
                }
                const index = list.lastIndexOf(list.reduce((best, table) => bytes(table) > bytes(best) ? table : best, list[list.length - 1]));
                freed += bytes(list.splice(index, 1)[0]) + 1;
                continue;
            }
            freed += bytes(list.pop()) + 1;
        }
    }
    const record = compose();
    const omittedBySection = {};
    if (droppedText.chars > 0)
        omittedBySection.content = droppedText.chars;
    for (const name of ['controls', 'links']) {
        const listed = lists[name];
        if (listed && found[name] !== undefined && found[name] > listed.length)
            omittedBySection[name] = found[name] - listed.length;
    }
    const framesTotal = Array.isArray(input.head.frames) ? input.head.frames.length : 0;
    if (lists.frames && lists.frames.length < framesTotal)
        omittedBySection.frames = framesTotal - lists.frames.length;
    if (lists.tables) {
        if (found.tables !== undefined && found.tables > lists.tables.length)
            omittedBySection.tables = found.tables - lists.tables.length;
        const rowsOmitted = lists.tables.reduce((sum, table) => sum + Math.max(0, Number(table.totalRows) - table.rows.length), 0);
        if (rowsOmitted > 0)
            omittedBySection.tableRows = rowsOmitted;
    }
    if (!Object.keys(omittedBySection).length)
        return { record };
    const parts = [];
    const itemSections = [...byItems].filter(name => omittedBySection[name] !== undefined || (name === 'tables' && omittedBySection.tableRows !== undefined));
    if (itemSections.length)
        parts.push(`maxItems=${maxItems} reached for ${itemSections.join(', ')}`);
    const byteSections = [...byBytes].filter(name => omittedBySection[name === 'tables' ? 'tables' : name] !== undefined || (name === 'tables' && omittedBySection.tableRows !== undefined));
    if (byteSections.length)
        parts.push(`maxBytes=${maxBytes} reached for ${byteSections.join(', ')}`);
    const units = 'content counts characters, tableRows counts rows, the others count items';
    return { record, truncation: { omittedBySection, reason: `${parts.join('; ') || 'output limit reached'} (${units})` } };
}
//# sourceMappingURL=observe.js.map