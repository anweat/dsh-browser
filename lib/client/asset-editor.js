/**
 * Pure helpers behind the asset editor: what the editor shows, when it counts as changed, and what the
 * latest test vouches for. No React and no RPC, so they can be unit-tested directly.
 * @module dsh-browser/client/asset-editor
 */
/** The fields a person edits. Everything else (id, revision, hash, status, credentials, counters) is shown, never edited. */
const EDITABLE_KEYS = [
    'kind', 'name', 'description', 'domains', 'tags', 'inputNames', 'schemaVersion', 'recipe', 'source',
    'inputSchema', 'outputSchema', 'postconditions', 'requiredCapabilities',
];
/** The saved asset as the editor text starts out: only the editable fields, so a test or a status change never makes it look edited. */
export function editableView(asset) {
    const record = asset;
    return Object.fromEntries(EDITABLE_KEYS.filter(key => record[key] !== undefined).map(key => [key, structuredClone(record[key])]));
}
export function serializeEditable(asset) {
    return JSON.stringify(editableView(asset), null, 2);
}
/** JSON with sorted keys, so reformatting or reordering the text is not an edit. */
export function stableJson(value) {
    if (Array.isArray(value))
        return '[' + value.map(entry => stableJson(entry)).join(',') + ']';
    if (value && typeof value === 'object') {
        const record = value;
        return '{' + Object.keys(record).sort().map(key => JSON.stringify(key) + ':' + stableJson(record[key])).join(',') + '}';
    }
    return JSON.stringify(value) ?? 'null';
}
/** Whether the editor text differs from the baseline it was loaded from. Text that is not JSON is compared as text. */
export function isDirty(text, baseline) {
    if (text === baseline)
        return false;
    try {
        return stableJson(JSON.parse(text)) !== stableJson(JSON.parse(baseline));
    }
    catch {
        return true;
    }
}
/** Parse the editor text into something saveable, or say why not. */
export function parseEditor(text) {
    let value;
    try {
        value = JSON.parse(text);
    }
    catch (error) {
        return { ok: false, message: error instanceof Error ? error.message : String(error) };
    }
    if (!value || typeof value !== 'object' || Array.isArray(value))
        return { ok: false, message: 'the editor must hold one JSON object' };
    const record = value;
    if (record.kind !== 'recipe' && record.kind !== 'userscript')
        return { ok: false, message: 'kind must be "recipe" or "userscript"' };
    if (typeof record.name !== 'string' || !record.name.trim())
        return { ok: false, message: 'name must be a non-empty string' };
    return { ok: true, value: record };
}
export function shortHash(hash) { return hash ? hash.slice(0, 8) : '--------'; }
export function credentialView(asset) {
    const credentials = asset?.testCredentials ?? [];
    const current = credentials.filter(entry => entry.revision === asset?.revision).at(-1);
    return {
        ...current ? { current } : {}, ...credentials.at(-1) ? { latest: credentials.at(-1) } : {},
        vouches: !!asset && !!current && current.passed && asset.testStatus === 'passed' && (asset.contentHash === undefined || current.contentHash === asset.contentHash),
    };
}
//# sourceMappingURL=asset-editor.js.map