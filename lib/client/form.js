/**
 * The browser settings card's form model.
 *
 * Staging, the revision fence, and the snapshot store are owned by the shared
 * `SettingsFormModel` from `@deepseek-ai/dsh-client-ui-primitives` — the same
 * model every official settings page uses — so this module only declares which
 * fields the card edits and how each one converts between stored value and
 * draft text. A save is one `mutate(ops, revision)`; `set`/`unset` per field no
 * longer exist on this Host line.
 * @module dsh-browser/client/form
 */
import { SettingsFormModel, settingsNumberField, settingsTextField } from '@deepseek-ai/dsh-client-ui-primitives';
import { PROMPT_TEXT_FIELDS, canonicalPrompts, extrasText, getAt, setAt, validExtras, validPrompts, withExtras } from "./prompts-form.js";
/** A free-text field that clears when emptied, so blanking the control resets it. */
const textField = (field) => settingsTextField(field);
/**
 * A boolean field. The card renders a checkbox, so the conversion is explicit
 * rather than relying on the shared model's text round-trip.
 */
const booleanField = (field) => ({
    field,
    format: value => value === true ? 'true' : 'false',
    parse: text => text === 'true' || text === 'false' ? { kind: 'set', value: text === 'true' } : undefined,
});
/**
 * An enumerated field. Accepts only a value on the list, so an unknown string
 * blocks the save instead of writing something the Host would reject.
 */
const enumField = (field, values) => ({
    field,
    format: value => typeof value === 'string' ? value : values[0] ?? '',
    parse: text => values.includes(text) ? { kind: 'set', value: text } : undefined,
});
/** A whole-number field bounded to a range; an empty draft clears it. */
const rangedNumberField = (field, min, max) => {
    const base = settingsNumberField(field);
    return {
        field,
        format: base.format,
        parse(text) {
            if (text.trim() === '')
                return { kind: 'clear' };
            const value = Number(text);
            return Number.isInteger(value) && value >= min && value <= max ? { kind: 'set', value } : undefined;
        },
    };
};
/** JSON object field: parses to a record, and an empty draft clears the field. */
const jsonField = (field, validate) => ({
    field,
    format: value => value && typeof value === 'object' && !Array.isArray(value) ? JSON.stringify(value, null, 2) : '',
    parse(text) {
        if (text.trim() === '')
            return { kind: 'clear' };
        try {
            const value = JSON.parse(text);
            if (!value || typeof value !== 'object' || Array.isArray(value))
                return undefined;
            const record = value;
            return validate && !validate(record) ? undefined : { kind: 'set', value: record };
        }
        catch {
            return undefined;
        }
    },
});
const POLICY_BOUNDS = {
    minDelayMs: [0, 60_000], maxConcurrency: [1, 8], burst: [1, 20], maxPagesPerRun: [1, 100],
    maxDepth: [0, 5], retryLimit: [0, 5], backoffBaseMs: [1, 60_000], cooldownMs: [100, 300_000],
};
const ASSET_POLICY_KEYS = new Set([
    'enabled', 'directory', 'persistenceMode', 'activationMode', 'minSuccessfulRuns', 'minDistinctSessions',
    'successWindowDays', 'minSuccessRate', 'maxCandidates', 'candidateTtlDays', 'maxSuggestionsPerDay',
    'maxDrafts', 'maxActiveAssets', 'retrievalTopK', 'catalogTokenBudget',
    'modelDevelopmentEnabled', 'maxModelDraftWritesPerSession', 'maxTestCredentials',
]);
function validAssetPolicy(value) {
    if (Object.keys(value).some(key => !ASSET_POLICY_KEYS.has(key)))
        return false;
    if (value.enabled !== undefined && typeof value.enabled !== 'boolean')
        return false;
    if (value.directory !== undefined && typeof value.directory !== 'string')
        return false;
    if (value.modelDevelopmentEnabled !== undefined && typeof value.modelDevelopmentEnabled !== 'boolean')
        return false;
    if (value.persistenceMode !== undefined && !['off', 'manual', 'suggest', 'auto-draft'].includes(String(value.persistenceMode)))
        return false;
    if (value.activationMode !== undefined && !['manual', 'auto-tested'].includes(String(value.activationMode)))
        return false;
    const numeric = ['minSuccessfulRuns', 'minDistinctSessions', 'successWindowDays', 'minSuccessRate', 'maxCandidates', 'candidateTtlDays', 'maxSuggestionsPerDay', 'maxDrafts', 'maxActiveAssets', 'retrievalTopK', 'catalogTokenBudget', 'maxModelDraftWritesPerSession', 'maxTestCredentials'];
    return Object.entries(value).every(([key, entry]) => {
        if (!numeric.includes(key))
            return true;
        return typeof entry === 'number' && Number.isFinite(entry) && entry >= 0;
    });
}
function validUsagePolicy(value) {
    if (Object.keys(value).some(key => !(key in POLICY_BOUNDS)))
        return false;
    return Object.entries(POLICY_BOUNDS).every(([key, [min, max]]) => {
        const entry = value[key];
        return entry === undefined || (typeof entry === 'number' && Number.isInteger(entry) && entry >= min && entry <= max);
    });
}
/**
 * The single-input section fields the card edits, in display order. Every entry
 * must also be `.volatile()` in the Host Config schema: `volatileForm` drops
 * unmarked fields, and the Host would refuse a write to one.
 */
export const FIELD_SPECS = [
    booleanField('enabled'),
    enumField('automationMode', ['read-only', 'standard', 'autonomous', 'unrestricted']),
    enumField('toolSurface', ['indexed', 'flat']),
    enumField('browserRuntime', ['playwright', 'patchright']),
    textField('channel'),
    rangedNumberField('cdpPort', 1, 65_535),
    rangedNumberField('maxSessions', 1, 64),
    booleanField('headless'),
    booleanField('opencliEnabled'),
    booleanField('autoInstall'),
    textField('storageStatePath'),
    textField('defaultAuthProfile'),
    textField('executablePath'),
    textField('snapshotDir'),
    booleanField('verbose'),
];
/** The JSON-shaped section fields the card renders as code editors. */
export const JSON_FIELD_SPECS = [
    jsonField('usagePolicy', validUsagePolicy),
    jsonField('automationAssets', validAssetPolicy),
    jsonField('prompts', validPrompts),
];
/** Section fields rendered as JSON code editors rather than single inputs. */
export const JSON_FIELDS = new Set(JSON_FIELD_SPECS.map(spec => spec.field));
/** Every field the card renders, in display order. */
export const ALL_FIELD_SPECS = [...FIELD_SPECS, ...JSON_FIELD_SPECS];
export class BrowserSettingsController {
    scope;
    form;
    store;
    /** What the person typed in the groups/actions/errorHints box, kept verbatim while it is not valid JSON yet. */
    extrasRaw;
    extrasInvalid = false;
    constructor(scope) {
        this.scope = scope;
        this.form = new SettingsFormModel(scope, [...ALL_FIELD_SPECS]);
        this.store = this.form.bind(() => this.project());
    }
    inject() {
        const actions = this.form.actions();
        return {
            hooks: { browserSettings: this.store },
            ...actions,
            // A save is refused while the groups/actions/errorHints box holds something that is not valid.
            save: () => this.save(),
            discard: () => { this.extrasRaw = undefined; this.extrasInvalid = false; actions.discard(); },
            editPromptText: (id, text) => this.editPromptText(id, text),
            setPromptSkillEnabled: (enabled) => this.setPromptSkillEnabled(enabled),
            editPromptExtras: (text) => this.editPromptExtras(text),
            resetPromptExtras: () => this.resetPromptExtras(),
        };
    }
    async save() {
        if (this.extrasInvalid)
            return;
        await this.form.save();
        // What was typed is now the stored value, so the box shows that again. (A failed save keeps the draft and its flag.)
        if (!this.form.shell().failed && this.extrasRaw !== undefined) {
            this.extrasRaw = undefined;
            this.refresh();
        }
    }
    // --- the prompt text section: one staged `prompts` draft, several views of it ----------------------------------
    /** The staged `prompts` value as an object (empty when none, or when its text is not JSON). */
    promptsDraft() {
        const text = this.form.field('prompts').text;
        if (text.trim() === '')
            return {};
        try {
            const value = JSON.parse(text);
            return value && typeof value === 'object' && !Array.isArray(value) ? canonicalPrompts(value) : {};
        }
        catch {
            return {};
        }
    }
    stagePrompts(value) {
        const next = canonicalPrompts(value);
        const stored = this.scope.getSnapshot().value?.prompts;
        const same = JSON.stringify(next) === JSON.stringify(stored && typeof stored === 'object' ? canonicalPrompts(stored) : {});
        // Back at the stored value: stage its own text, so the form no longer counts a change.
        const text = same ? ALL_FIELD_SPECS.find(spec => spec.field === 'prompts').format(stored) : Object.keys(next).length ? JSON.stringify(next, null, 2) : '';
        this.form.actions().edit('prompts', text);
    }
    refresh() { this.form.actions().edit('prompts', this.form.field('prompts').text); }
    editPromptText(id, text) {
        const field = PROMPT_TEXT_FIELDS.find(entry => entry.id === id);
        this.stagePrompts(setAt(this.promptsDraft(), field.path, text.trim() === '' ? undefined : text));
    }
    setPromptSkillEnabled(enabled) {
        this.stagePrompts(setAt(this.promptsDraft(), ['skill', 'enabled'], enabled ? undefined : false));
    }
    editPromptExtras(text) {
        this.extrasRaw = text;
        this.extrasInvalid = false;
        if (text.trim() === '') {
            this.stagePrompts(withExtras(this.promptsDraft(), {}));
            return;
        }
        try {
            const value = JSON.parse(text);
            if (value && typeof value === 'object' && !Array.isArray(value) && validExtras(value)) {
                this.stagePrompts(withExtras(this.promptsDraft(), value));
                return;
            }
        }
        catch { /* reported below */ }
        this.extrasInvalid = true;
        this.refresh();
    }
    /** Back to the plugin's own text for groups, actions and error hints. */
    resetPromptExtras() {
        this.extrasRaw = undefined;
        this.extrasInvalid = false;
        this.stagePrompts(withExtras(this.promptsDraft(), {}));
    }
    snapshot() { return this.store.getSnapshot(); }
    dispose() { this.form.dispose(); }
    project() {
        const fields = {};
        for (const spec of FIELD_SPECS)
            fields[spec.field] = this.form.field(spec.field);
        const jsonFields = {};
        for (const spec of JSON_FIELD_SPECS)
            jsonFields[spec.field] = this.form.field(spec.field);
        const shell = this.form.shell();
        return { ...shell, invalid: shell.invalid || this.extrasInvalid, fields, jsonFields, prompts: this.projectPrompts(jsonFields.prompts) };
    }
    projectPrompts(field) {
        const draft = this.promptsDraft();
        const texts = {};
        for (const entry of PROMPT_TEXT_FIELDS) {
            const value = getAt(draft, entry.path);
            const text = typeof value === 'string' ? value : '';
            texts[entry.id] = { text, invalid: text.length > entry.limit };
        }
        return {
            texts,
            skillEnabled: getAt(draft, ['skill', 'enabled']) !== false,
            extras: { text: this.extrasRaw ?? extrasText(draft), invalid: this.extrasInvalid },
            overridden: field.overridden,
            invalid: field.invalid,
        };
    }
}
//# sourceMappingURL=form.js.map