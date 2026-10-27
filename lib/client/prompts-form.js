/**
 * Pure helpers for the "prompt text" section of the settings card.
 *
 * The whole `prompts` configuration is one staged JSON field (the host writes top-level fields); the card's separate
 * controls (tool descriptions, root guide and note, the skill) and the JSON box for groups, actions and error hints
 * are two views of that one draft. Nothing here touches the host or the DOM.
 * @module dsh-browser/client/prompts-form
 */
import { PROMPT_LIMITS } from "../prompt-limits.js";
/** The single-line and multi-line text controls of the section, by id, with the path each edits and its length cap. */
export const PROMPT_TEXT_FIELDS = [
    { id: 'indexDescription', path: ['tools', 'browser_index', 'description'], limit: PROMPT_LIMITS.description, multiline: true },
    { id: 'callDescription', path: ['tools', 'browser_call', 'description'], limit: PROMPT_LIMITS.description, multiline: true },
    { id: 'rootGuide', path: ['rootGuide'], limit: PROMPT_LIMITS.rootGuide, multiline: true },
    { id: 'rootNote', path: ['rootNote'], limit: PROMPT_LIMITS.rootNote, multiline: true },
    { id: 'skillDescription', path: ['skill', 'description'], limit: PROMPT_LIMITS.skillDescription, multiline: false },
    { id: 'skillBodyFile', path: ['skill', 'bodyFile'], limit: 1024, multiline: false },
    { id: 'skillAppend', path: ['skill', 'append'], limit: PROMPT_LIMITS.skillAppend, multiline: true },
];
/** Read the default export's JSON into {@link PromptDefaults}; undefined when it is not the expected shape. */
export function defaultsFromJson(json) {
    let root;
    try {
        root = JSON.parse(json);
    }
    catch {
        return undefined;
    }
    if (!isRecord(root))
        return undefined;
    const texts = {};
    for (const field of PROMPT_TEXT_FIELDS) {
        const value = getAt(root, field.path);
        if (typeof value === 'string' && value !== '')
            texts[field.id] = value;
    }
    const extras = {};
    for (const key of PROMPT_EXTRA_KEYS)
        if (isRecord(root[key]))
            extras[key] = root[key];
    return { texts, extras };
}
/**
 * `extras` without the entries that equal the plugin's default: copying the whole default into the box and changing
 * one line must save one override, not freeze every other text at today's wording.
 */
export function pruneDefaultExtras(extras, defaults) {
    const out = {};
    for (const key of PROMPT_EXTRA_KEYS) {
        const given = extras[key];
        if (!isRecord(given))
            continue;
        const base = isRecord(defaults[key]) ? defaults[key] : {};
        const kept = {};
        for (const [name, entry] of Object.entries(given)) {
            const baseEntry = base[name];
            if (typeof entry === 'string') {
                if (entry !== baseEntry)
                    kept[name] = entry;
                continue;
            }
            if (!isRecord(entry)) {
                kept[name] = entry;
                continue;
            }
            const baseFields = isRecord(baseEntry) ? baseEntry : {};
            const changed = Object.fromEntries(Object.entries(entry).filter(([field, text]) => text !== (baseFields[field] ?? '')));
            if (Object.keys(changed).length)
                kept[name] = changed;
        }
        if (Object.keys(kept).length)
            out[key] = kept;
    }
    return out;
}
/** The overridden entries of a `prompts` draft, in the order groups, actions, errorHints. */
export function extraEntries(draft) {
    const out = [];
    for (const kind of PROMPT_EXTRA_KEYS) {
        const group = draft[kind];
        if (!isRecord(group))
            continue;
        for (const [key, value] of Object.entries(group)) {
            if (typeof value === 'string')
                out.push({ kind, key, text: value });
            else if (isRecord(value))
                out.push({ kind, key, ...typeof value.summary === 'string' ? { summary: value.summary } : {}, ...typeof value.notes === 'string' ? { notes: value.notes } : {} });
        }
    }
    return out;
}
/** `draft` with one entry set (or removed when `value` is undefined or empty); parents left empty go with it. */
export function withExtraEntry(draft, kind, key, value) {
    const copy = structuredClone(draft);
    const group = isRecord(copy[kind]) ? copy[kind] : {};
    const empty = value === undefined || (typeof value === 'string' ? value === '' : !value.summary && !value.notes);
    if (empty)
        delete group[key];
    else
        group[key] = typeof value === 'string' ? value : Object.fromEntries(Object.entries(value).filter(([, text]) => typeof text === 'string' && text !== ''));
    if (Object.keys(group).length)
        copy[kind] = group;
    else
        delete copy[kind];
    return copy;
}
/** The members the JSON box edits; the other controls own the rest. */
export const PROMPT_EXTRA_KEYS = ['groups', 'actions', 'errorHints'];
const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
export function getAt(root, path) {
    let node = root;
    for (const key of path) {
        if (!isRecord(node))
            return undefined;
        node = node[key];
    }
    return node;
}
/** A copy of `root` with `path` set to `value`; an empty or absent value removes it, and parents left empty go with it. */
export function setAt(root, path, value) {
    const copy = structuredClone(root);
    const trail = [copy];
    let node = copy;
    for (const key of path.slice(0, -1)) {
        const next = node[key];
        node = isRecord(next) ? next : (node[key] = {});
        trail.push(node);
    }
    const last = path[path.length - 1];
    if (value === undefined || value === '')
        delete node[last];
    else
        node[last] = value;
    for (let depth = path.length - 1; depth > 0; depth--) {
        const parent = trail[depth - 1];
        if (Object.keys(trail[depth]).length === 0)
            delete parent[path[depth - 1]];
    }
    return copy;
}
const stringMap = (value, limit, inner) => isRecord(value) && Object.values(value).every(entry => {
    if (inner)
        return isRecord(entry) && Object.entries(entry).every(([key, text]) => inner.includes(key) && typeof text === 'string' && text.length <= limit);
    return typeof entry === 'string' && entry.length <= limit;
});
/** The groups/actions/errorHints box: groups and actions are objects of `{summary, notes}`, errorHints a code-to-text map. */
export function validExtras(value) {
    if (Object.keys(value).some(key => !PROMPT_EXTRA_KEYS.includes(key)))
        return false;
    const { groups, actions, errorHints } = value;
    if (groups !== undefined && !stringMap(groups, PROMPT_LIMITS.summary, ['summary']))
        return false;
    if (actions !== undefined && !(isRecord(actions) && Object.values(actions).every(entry => isRecord(entry)
        && Object.entries(entry).every(([key, text]) => (key === 'summary' || key === 'notes') && typeof text === 'string' && text.length <= (key === 'summary' ? PROMPT_LIMITS.summary : PROMPT_LIMITS.topicText)))))
        return false;
    if (errorHints !== undefined && !stringMap(errorHints, PROMPT_LIMITS.errorHint))
        return false;
    return true;
}
/**
 * Whether a whole `prompts` value is acceptable to save: known top-level keys, strings within their caps, a boolean
 * `skill.enabled`. Group names, action names and error codes are the plugin's to judge (it reports unknown ones as
 * diagnostics), so they are not checked here.
 */
export function validPrompts(value) {
    const known = ['tools', 'rootGuide', 'rootNote', 'groups', 'actions', 'errorHints', 'skill'];
    if (Object.keys(value).some(key => !known.includes(key)))
        return false;
    for (const field of PROMPT_TEXT_FIELDS) {
        const entry = getAt(value, field.path);
        if (entry !== undefined && (typeof entry !== 'string' || entry.length > field.limit))
            return false;
    }
    const tools = value.tools;
    if (tools !== undefined && !(isRecord(tools) && Object.keys(tools).every(key => key === 'browser_index' || key === 'browser_call')))
        return false;
    const skill = value.skill;
    if (skill !== undefined) {
        if (!isRecord(skill) || Object.keys(skill).some(key => !['enabled', 'description', 'bodyFile', 'append'].includes(key)))
            return false;
        if (skill.enabled !== undefined && typeof skill.enabled !== 'boolean')
            return false;
    }
    return validExtras(Object.fromEntries(PROMPT_EXTRA_KEYS.filter(key => value[key] !== undefined).map(key => [key, value[key]])));
}
/** The JSON box's content for a `prompts` value: its groups, actions and errorHints, or empty when it has none. */
export function extrasText(value) {
    value = canonicalPrompts(value);
    const extras = Object.fromEntries(PROMPT_EXTRA_KEYS.filter(key => value[key] !== undefined).map(key => [key, value[key]]));
    return Object.keys(extras).length ? JSON.stringify(extras, null, 2) : '';
}
/** A copy of a `prompts` value with groups, actions and errorHints replaced by `extras` (absent members removed). */
export function withExtras(value, extras) {
    const copy = Object.fromEntries(Object.entries(value).filter(([key]) => !PROMPT_EXTRA_KEYS.includes(key)));
    for (const key of PROMPT_EXTRA_KEYS)
        if (extras[key] !== undefined && isRecord(extras[key]) && Object.keys(extras[key]).length)
            copy[key] = extras[key];
    return copy;
}
/** Drop empty containers and the `skill.enabled=true` default, so equal settings compare equal whatever defaults the host filled in. */
export function canonicalPrompts(value) {
    const clean = (node) => {
        if (!isRecord(node))
            return node;
        const out = {};
        for (const [key, entry] of Object.entries(node)) {
            const next = clean(entry);
            if (isRecord(next) && Object.keys(next).length === 0)
                continue;
            if (next === undefined || next === '')
                continue;
            out[key] = next;
        }
        return out;
    };
    const out = clean(value);
    const skill = out.skill;
    if (isRecord(skill) && skill.enabled === true) {
        const { enabled: _enabled, ...rest } = skill;
        if (Object.keys(rest).length)
            out.skill = rest;
        else
            delete out.skill;
    }
    return out;
}
//# sourceMappingURL=prompts-form.js.map