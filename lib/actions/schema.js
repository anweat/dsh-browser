/**
 * Shared sub-schemas plus the validator and renderers for action parameters.
 *
 * `LOCATOR_SCHEMA` and friends are defined exactly once. Actions reference them
 * with `{ ref: 'locator' }`; the flat tool surface expands the reference inline
 * (the Host needs a self-contained schema per tool) and the indexed surface
 * prints them once in the L2 detail.
 * @module dsh-browser/actions/schema
 */
const FRAME_SCHEMA = {
    type: 'object',
    additionalProperties: false,
    description: 'Iframe to search inside. Use exactly one field.',
    properties: {
        selector: { type: 'string', description: 'CSS selector for an iframe.' },
        name: { type: 'string', description: 'Frame name.' },
        url: { type: 'string', description: 'Playwright frame URL/glob.' },
    },
};
const LOCATOR_SCHEMA = {
    type: 'object',
    additionalProperties: false,
    description: 'Element locator. Use exactly one of selector, role, text, or label.',
    properties: {
        selector: { type: 'string', description: 'CSS selector.' },
        role: { type: 'string', description: 'Accessible role used by Playwright getByRole.' },
        name: { type: 'string', description: 'Optional accessible name; valid only with role.' },
        text: { type: 'string', description: 'Visible text used by Playwright getByText.' },
        label: { type: 'string', description: 'Form label used by Playwright getByLabel.' },
        exact: { type: 'boolean', description: 'Require an exact semantic match. Defaults to false.' },
        frame: { ref: 'frame' },
    },
};
const RECIPE_STEP_SCHEMA = {
    type: 'object',
    additionalProperties: false,
    description: 'One declarative Playwright recipe step.',
    properties: {
        type: { type: 'string', required: true, enum: ['wait', 'click', 'fill', 'type', 'press', 'select', 'check', 'hover', 'scroll', 'extract', 'assert', 'screenshot'] },
        condition: { type: 'string', enum: ['selector', 'text', 'load', 'time'] },
        selector: { type: 'string' },
        value: { type: 'string' },
        text: { type: 'string' },
        key: { type: 'string' },
        timeoutMs: { type: 'number' },
        waitMs: { type: 'number' },
        deltaY: { type: 'number' },
        checked: { type: 'boolean' },
        mode: { type: 'string', enum: ['text', 'html', 'links', 'attribute'] },
        attribute: { type: 'string' },
        limit: { type: 'number' },
    },
};
export const SHARED_SCHEMAS = {
    frame: FRAME_SCHEMA,
    locator: LOCATOR_SCHEMA,
    recipeStep: RECIPE_STEP_SCHEMA,
};
/** The two params every element-targeting action accepts. */
export const TARGET_PARAMS = {
    selector: { type: 'string', description: 'CSS selector. Omit when locator is given; pass exactly one of selector or locator.' },
    locator: { ref: 'locator' },
};
function resolve(node) {
    if (!node.ref)
        return node;
    const shared = SHARED_SCHEMAS[node.ref];
    return { ...shared, ...node.description ? { description: node.description } : {} };
}
/** Expand every `ref` inline: the self-contained shape a flat tool needs. */
export function expandNode(node) {
    const resolved = resolve(node);
    const { ref: _ref, ...rest } = resolved;
    const out = { ...rest };
    if (resolved.items)
        out.items = expandNode(resolved.items);
    if (resolved.properties)
        out.properties = Object.fromEntries(Object.entries(resolved.properties).map(([key, value]) => [key, expandNode(value)]));
    return out;
}
export function expandParams(params) {
    return Object.fromEntries(Object.entries(params).map(([key, value]) => [key, expandNode(value)]));
}
const MAX_ERRORS = 6;
function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function describeType(value) {
    if (Array.isArray(value))
        return 'array';
    if (value === null)
        return 'null';
    return typeof value;
}
function validateObject(properties, open, value, path, errors) {
    if (!isRecord(value)) {
        errors.push(`${path || 'args'}: expected object, got ${describeType(value)}`);
        return undefined;
    }
    const out = {};
    for (const [key, entry] of Object.entries(value)) {
        const node = properties[key];
        if (!node) {
            if (open)
                out[key] = entry;
            else
                errors.push(`${path ? path + '.' : ''}${key}: unknown argument (allowed: ${Object.keys(properties).join(', ') || 'none'})`);
            continue;
        }
        // Models often send null for an omitted optional value; treat it as absent.
        if (entry === null || entry === undefined)
            continue;
        const checked = validateNode(node, entry, `${path ? path + '.' : ''}${key}`, errors);
        if (checked !== undefined)
            out[key] = checked;
    }
    for (const [key, node] of Object.entries(properties)) {
        if (node.required && !(key in out) && !errors.some(error => error.startsWith(`${path ? path + '.' : ''}${key}:`))) {
            errors.push(`${path ? path + '.' : ''}${key}: required`);
        }
    }
    return out;
}
function validateNode(raw, value, path, errors) {
    if (errors.length >= MAX_ERRORS)
        return undefined;
    const node = resolve(raw);
    switch (node.type) {
        case 'string':
            if (typeof value !== 'string') {
                errors.push(`${path}: expected string, got ${describeType(value)}`);
                return undefined;
            }
            if (node.enum && !node.enum.includes(value)) {
                errors.push(`${path}: must be one of ${node.enum.join(' | ')}`);
                return undefined;
            }
            return value;
        case 'number':
            if (typeof value !== 'number' || !Number.isFinite(value)) {
                errors.push(`${path}: expected number, got ${describeType(value)}`);
                return undefined;
            }
            return value;
        case 'boolean':
            if (typeof value !== 'boolean') {
                errors.push(`${path}: expected boolean, got ${describeType(value)}`);
                return undefined;
            }
            return value;
        case 'array': {
            if (!Array.isArray(value)) {
                errors.push(`${path}: expected array, got ${describeType(value)}`);
                return undefined;
            }
            if (!node.items)
                return value;
            const items = [];
            value.forEach((entry, index) => {
                const checked = validateNode(node.items, entry, `${path}[${index}]`, errors);
                if (checked !== undefined)
                    items.push(checked);
            });
            return items;
        }
        case 'object':
            return validateObject(node.properties ?? {}, node.additionalProperties === true || !node.properties, value, path, errors);
        default:
            return value;
    }
}
/** Validate call arguments against an action's parameter schema. */
export function validateArgs(params, args) {
    const errors = [];
    const input = args === undefined || args === null ? {} : args;
    const value = validateObject(params, false, input, '', errors) ?? {};
    return { ok: errors.length === 0, value, errors };
}
// --- rendering ------------------------------------------------------------
function refsOf(node, into) {
    if (node.ref) {
        into.add(node.ref);
        refsOf(SHARED_SCHEMAS[node.ref], into);
    }
    if (node.items)
        refsOf(node.items, into);
    for (const child of Object.values(node.properties ?? {}))
        refsOf(child, into);
}
function usedRefs(params) {
    const refs = new Set();
    for (const node of Object.values(params))
        refsOf(node, refs);
    return [...refs];
}
function compactNode(node) {
    if (node.ref)
        return '$' + node.ref;
    switch (node.type) {
        case 'string': return node.enum ? node.enum.map(value => JSON.stringify(value)).join('|') : 'string';
        case 'number': return 'number';
        case 'boolean': return 'boolean';
        case 'array': return (node.items ? compactNode(node.items) : 'any') + '[]';
        case 'object': return node.properties ? '{' + compactFields(node.properties) + '}' : 'object';
        default: return 'any';
    }
}
function compactFields(properties) {
    return Object.entries(properties).map(([key, node]) => `${key}${node.required ? '' : '?'}: ${compactNode(node)}`).join(', ');
}
/** One-line parameter summary: `selector?: string, locator?: $locator`. */
export function compactParams(params) {
    return compactFields(params);
}
/** Compact schema block attached to INVALID_ARGS replies. */
export function compactSchema(action, params) {
    const lines = [`${action}(${compactFields(params)})`];
    for (const ref of usedRefs(params))
        lines.push(`$${ref} = {${compactFields(SHARED_SCHEMAS[ref].properties ?? {})}}`);
    return lines.join('\n');
}
function describedFields(properties, indent) {
    return Object.entries(properties).map(([key, node]) => {
        const note = node.description ? ' - ' + node.description : '';
        return `${indent}${key}${node.required ? '' : '?'}: ${compactNode(node)}${note}`;
    });
}
/** Full parameter listing with descriptions, followed by each shared sub-schema once. */
export function describeParams(params) {
    const lines = Object.keys(params).length ? describedFields(params, '  ') : ['  (no arguments)'];
    for (const ref of usedRefs(params)) {
        const shared = SHARED_SCHEMAS[ref];
        lines.push(`$${ref}${shared.description ? ' - ' + shared.description : ''}`);
        lines.push(...describedFields(shared.properties ?? {}, '  '));
    }
    return lines;
}
//# sourceMappingURL=schema.js.map