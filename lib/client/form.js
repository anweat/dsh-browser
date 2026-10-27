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
import { ASSET_POLICY_BOOLEAN_KEYS, ASSET_POLICY_ENUMS, ASSET_POLICY_INTEGER_RANGES, ASSET_POLICY_KEYS, ASSET_POLICY_STRING_KEYS, USAGE_POLICY_BOUNDS } from "../policy-keys.js";
import { crossFieldProblems, fieldProblem } from "./field-rules.js";
import { PROPERTY_FIELDS, checkProperties, commentOutProperty, parseProperties, serializeProperties, } from "./properties-form.js";
import { propertyDocs } from "./property-docs.js";
import { POLICY_SPECS, defaultOf, parsePolicyText, valueText } from "./policy-fields.js";
import { parseProfiles, validAuthProfiles } from "./auth-profiles-form.js";
import { PROMPT_TEXT_FIELDS, extraEntries, withExtraEntry, canonicalPrompts, pruneDefaultExtras, extrasText, getAt, setAt, validExtras, validPrompts, withExtras } from "./prompts-form.js";
/** A free-text field that clears when emptied, so blanking the control resets it. */
const textField = (field) => settingsTextField(field);
/**
 * A free-text field with a value rule (`field-rules.ts`, the rules the server applies): text the rule refuses is
 * invalid, which blocks the save, instead of being written and dropped at the next start.
 */
const checkedTextField = (field) => {
    const base = settingsTextField(field);
    return { field, format: base.format, parse: text => text.trim() !== '' && fieldProblem(field, text) !== undefined ? undefined : base.parse(text) };
};
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
/** A JSON array of strings (Chromium launch arguments): written compactly on one line, an empty draft clears it. */
const stringArrayField = (field) => ({
    field,
    format: value => Array.isArray(value) && value.length ? JSON.stringify(value) : '',
    parse(text) {
        if (text.trim() === '')
            return { kind: 'clear' };
        try {
            const value = JSON.parse(text);
            return Array.isArray(value) && value.every(entry => typeof entry === 'string' && entry.length > 0) ? { kind: 'set', value } : undefined;
        }
        catch {
            return undefined;
        }
    },
});
const ASSET_KEYS = new Set(ASSET_POLICY_KEYS);
const NON_NUMERIC_ASSET_KEYS = new Set([...ASSET_POLICY_BOOLEAN_KEYS, ...ASSET_POLICY_STRING_KEYS, ...Object.keys(ASSET_POLICY_ENUMS)]);
function validAssetPolicy(value) {
    if (Object.keys(value).some(key => !ASSET_KEYS.has(key)))
        return false;
    return Object.entries(value).every(([key, entry]) => {
        if (ASSET_POLICY_BOOLEAN_KEYS.includes(key))
            return entry === undefined || typeof entry === 'boolean';
        if (ASSET_POLICY_STRING_KEYS.includes(key))
            return entry === undefined || typeof entry === 'string';
        const choices = ASSET_POLICY_ENUMS[key];
        if (choices)
            return entry === undefined || choices.includes(String(entry));
        if (NON_NUMERIC_ASSET_KEYS.has(key))
            return true;
        if (typeof entry !== 'number' || !Number.isFinite(entry) || entry < 0)
            return false;
        const range = ASSET_POLICY_INTEGER_RANGES[key];
        return !range || (Number.isInteger(entry) && entry >= range[0] && entry <= range[1]);
    });
}
function validUsagePolicy(value) {
    if (Object.keys(value).some(key => !(key in USAGE_POLICY_BOUNDS)))
        return false;
    return Object.entries(USAGE_POLICY_BOUNDS).every(([key, [min, max]]) => {
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
    checkedTextField('downloadDir'),
    booleanField('allowPrivateHosts'),
    rangedNumberField('downloadMaxBytes', 1, 10 * 1024 * 1024 * 1024),
    enumField('viewportMode', ['window', '720p', '1080p', 'custom']),
    rangedNumberField('viewportWidth', 200, 7680),
    rangedNumberField('viewportHeight', 200, 4320),
    checkedTextField('userAgent'),
    checkedTextField('locale'),
    checkedTextField('timezoneId'),
    checkedTextField('proxyServer'),
    checkedTextField('proxyBypass'),
    booleanField('verbose'),
];
/** The JSON-shaped section fields: objects (policies, prompts) and the launch-argument array. */
export const JSON_FIELD_SPECS = [
    jsonField('usagePolicy', validUsagePolicy),
    jsonField('automationAssets', validAssetPolicy),
    jsonField('prompts', validPrompts),
    jsonField('authProfiles', validAuthProfiles),
    stringArrayField('args'),
];
/**
 * Public config fields the card has no form for, on purpose: nested records (named login states, rule packs with
 * hash-pinned scripts) that are safer to edit in the profile config file. The card names each one and says so, instead
 * of leaving it out without a word. `rulePacks` is not `.volatile()` in the Host schema, so no form could write it.
 */
export const CONFIG_FILE_ONLY_FIELDS = ['rulePacks'];
/** Section fields rendered as JSON code editors rather than single inputs. */
export const JSON_FIELDS = new Set(JSON_FIELD_SPECS.map(spec => spec.field));
/** Every field the card renders, in display order. */
export const ALL_FIELD_SPECS = [...FIELD_SPECS, ...JSON_FIELD_SPECS];
export class BrowserSettingsController {
    scope;
    promptDefaults;
    form;
    store;
    /** What the person typed in the groups/actions/errorHints box, kept verbatim while it is not valid JSON yet. */
    extrasRaw;
    extrasInvalid = false;
    /** The properties text as typed; undefined shows the text printed from the staged fields. */
    propsRaw;
    propsIssues = [];
    /** The language of the comments printed in the advanced text; the card sets it from its own language. */
    docsLang = 'en';
    /** What was typed in each prompt control while it differs from what is staged (a text equal to the default stages nothing). */
    promptRaw = {};
    /** What was typed in a policy key's control while it is not a value the key accepts. */
    policyRaw = { usagePolicy: {}, automationAssets: {} };
    /** `promptDefaults` reads the plugin's own prompt texts once they are loaded; until then nothing is "equal to default". */
    constructor(scope, promptDefaults = () => undefined) {
        this.scope = scope;
        this.promptDefaults = promptDefaults;
        this.form = new SettingsFormModel(scope, [...ALL_FIELD_SPECS]);
        this.store = this.form.bind(() => this.project());
    }
    inject() {
        const actions = this.form.actions();
        return {
            hooks: { browserSettings: this.store },
            ...actions,
            // A control edit replaces whatever was typed in the advanced text: the text is a view of the fields, printed again.
            edit: (field, text) => { this.dropTypedProperties(); if (field in this.policyRaw)
                this.policyRaw[field] = {}; actions.edit(field, text); },
            resetField: (field) => { this.dropTypedProperties(); actions.resetField(field); },
            // A save is refused while the groups/actions/errorHints box holds something that is not valid.
            save: () => this.save(),
            discard: () => { this.clearPolicyRaw(); this.extrasRaw = undefined; this.extrasInvalid = false; this.propsRaw = undefined; this.propsIssues = []; this.clearPromptRaw(); actions.discard(); },
            editProperties: (text) => this.editProperties(text),
            setPropertyLanguage: (lang) => this.setPropertyLanguage(lang),
            resetProperty: (key) => this.resetProperty(key),
            editPromptText: (id, text) => this.editPromptText(id, text),
            setPromptSkillEnabled: (enabled) => this.setPromptSkillEnabled(enabled),
            editPromptExtras: (text) => this.editPromptExtras(text),
            editPolicyKey: (field, key, text) => this.editPolicyKey(field, key, text),
            saveAuthProfile: (id, entry) => this.saveAuthProfile(id, entry),
            removeAuthProfile: (id) => this.removeAuthProfile(id),
            resetPromptExtras: () => this.resetPromptExtras(),
            setPromptExtra: (kind, key, value) => this.setPromptExtra(kind, key, value),
        };
    }
    /** Forget the advanced text as typed, so it is printed again from the fields (their edits are already staged). */
    dropTypedProperties() { this.propsRaw = undefined; this.propsIssues = []; }
    /** Rules that span fields, read from the texts the fields hold now (the deployed sizes count when a control does not set them). */
    crossProblems() {
        const text = (key) => this.form.field(key).text;
        return crossFieldProblems({ viewportMode: text('viewportMode'), viewportWidth: text('viewportWidth'), viewportHeight: text('viewportHeight') });
    }
    /** The fields a save would write: the text differs from the stored one, or a reset leaves the stored override. */
    changedFields() {
        const value = this.scope.getSnapshot().value;
        return ALL_FIELD_SPECS.filter(spec => {
            const state = this.form.field(spec.field);
            return state.text !== spec.format(value?.[spec.field]) || (!state.overridden && this.isStored(spec.field));
        }).map(spec => spec.field);
    }
    async save() {
        if (this.extrasInvalid || this.policyHasRaw() || this.propsIssues.some(issue => issue.level === 'error') || Object.keys(this.crossProblems()).length)
            return;
        await this.form.save();
        // What was typed is now the stored value, so the box shows that again. (A failed save keeps the draft and its flag.)
        if (!this.form.shell().failed && (this.extrasRaw !== undefined || this.propsRaw !== undefined || Object.keys(this.promptRaw).length)) {
            this.extrasRaw = undefined;
            this.propsRaw = undefined;
            this.propsIssues = [];
            this.clearPromptRaw();
            this.refresh();
        }
    }
    // --- the default parameters editor: one text over the plugin-wide default fields ------------------------------
    spec(key) { return ALL_FIELD_SPECS.find(spec => spec.field === key); }
    /** The text of a field as the plugin has it now (stored, deployed, or default), ignoring anything staged. */
    storedText(key) { return this.spec(key).format(this.scope.getSnapshot().value?.[key]); }
    isStored(key) {
        const user = this.scope.getSnapshot().user;
        return user !== undefined && user !== null && Object.hasOwn(user, key);
    }
    /** Print the text from the fields as they are (staged edits included). */
    printProperties() {
        return serializeProperties(PROPERTY_FIELDS.map(field => {
            const state = this.form.field(field.key);
            return { key: field.key, text: state.text, overridden: state.overridden };
        }), propertyDocs(this.docsLang));
    }
    /**
     * Stage the fields to match a properties text: a key with a value is edited to it, a key without one (commented,
     * deleted, blank) goes back to the default. The staged result is the same per-field `set` / `unset` the one-control
     * form produced, so the saved configuration has the same flat keys and nothing else.
     */
    editProperties(text) {
        this.propsRaw = text;
        const parsed = parseProperties(text);
        this.propsIssues = checkProperties(parsed, key => this.form.field(key).text);
        const actions = this.form.actions();
        for (const field of PROPERTY_FIELDS) {
            const entry = parsed.values.get(field.key);
            if (entry)
                actions.edit(field.key, entry.value);
            else if (this.isStored(field.key))
                actions.resetField(field.key);
            else
                actions.edit(field.key, this.storedText(field.key));
        }
    }
    /** Print the comments of the advanced text in this language (`zh`, anything else is English). Text the person typed is not touched. */
    setPropertyLanguage(lang) {
        const next = lang === 'zh' ? 'zh' : 'en';
        if (next === this.docsLang)
            return;
        this.docsLang = next;
        this.refresh();
    }
    /** Comment out one key's line: that parameter goes back to the default. */
    resetProperty(key) {
        const current = this.propsRaw ?? this.printProperties();
        const base = this.scope.getSnapshot().base?.[key];
        this.editProperties(commentOutProperty(current, key, this.spec(key).format(base) || (PROPERTY_FIELDS.find(field => field.key === key)?.defaultText ?? '')));
    }
    projectProperties() {
        const text = this.propsRaw ?? this.printProperties();
        const parsed = parseProperties(text);
        const overridden = PROPERTY_FIELDS.filter(field => parsed.values.has(field.key)).map((field) => ({ key: field.key, value: parsed.values.get(field.key).value }));
        return { text, issues: this.propsIssues, overridden, invalid: this.propsIssues.some(issue => issue.level === 'error') };
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
    clearPromptRaw() { for (const key of Object.keys(this.promptRaw))
        delete this.promptRaw[key]; }
    /**
     * A prompt text: blank, or exactly the plugin's default text, is NO override. Saving the default as an override
     * would freeze today's wording and hide every later improvement, so the box keeps what was typed (an author may
     * have copied the default to edit it) while nothing is staged for it.
     */
    editPromptText(id, text) {
        const field = PROMPT_TEXT_FIELDS.find(entry => entry.id === id);
        const base = this.promptDefaults()?.texts[id];
        const none = text.trim() === '' || (base !== undefined && text === base);
        if (text === '' || !none)
            delete this.promptRaw[id];
        else
            this.promptRaw[id] = text;
        this.stagePrompts(setAt(this.promptsDraft(), field.path, none ? undefined : text));
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
                // Entries equal to the plugin's own text are not overrides (see editPromptText).
                const defaults = this.promptDefaults()?.extras;
                const effective = defaults ? pruneDefaultExtras(value, defaults) : value;
                this.stagePrompts(withExtras(this.promptsDraft(), effective));
                return;
            }
        }
        catch { /* reported below */ }
        this.extrasInvalid = true;
        this.refresh();
    }
    /**
     * One entry of the groups / actions / errorHints lists, from the entry dialog. An entry equal to the plugin's own
     * text is no override (see editPromptText), so it leaves the list instead of freezing today's wording.
     */
    setPromptExtra(kind, key, value) {
        this.extrasRaw = undefined;
        this.extrasInvalid = false;
        const next = withExtraEntry(this.promptsDraft(), kind, key, value);
        const defaults = this.promptDefaults()?.extras;
        const extras = Object.fromEntries(['groups', 'actions', 'errorHints'].filter(name => next[name] !== undefined).map(name => [name, next[name]]));
        const effective = defaults ? pruneDefaultExtras(extras, defaults) : extras;
        this.stagePrompts(withExtras(next, effective));
    }
    /** Back to the plugin's own text for groups, actions and error hints. */
    resetPromptExtras() {
        this.extrasRaw = undefined;
        this.extrasInvalid = false;
        this.stagePrompts(withExtras(this.promptsDraft(), {}));
    }
    // --- the policy objects, one control per key ---------------------------------------------------------------------
    clearPolicyRaw() { this.policyRaw.usagePolicy = {}; this.policyRaw.automationAssets = {}; }
    policyHasRaw() { return Object.values(this.policyRaw).some(entries => Object.keys(entries).length > 0); }
    /** The staged policy object (empty when its text is not a JSON object yet). */
    policyDraft(field) {
        const text = this.form.field(field).text;
        if (text.trim() === '')
            return {};
        try {
            const value = JSON.parse(text);
            return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
        }
        catch {
            return {};
        }
    }
    /** `value` without the keys that equal their default (and without anything the policy does not know), keys in the card's order. */
    minimalPolicy(field, value) {
        const out = {};
        for (const spec of POLICY_SPECS[field]) {
            const entry = value[spec.key];
            if (entry !== undefined && entry !== defaultOf(field, spec.key))
                out[spec.key] = entry;
        }
        return out;
    }
    /**
     * One key of a policy object, from its own control. A text the key does not accept is kept as typed (and blocks the
     * save); an empty text, or the default itself, removes the key so the object holds only what differs.
     */
    editPolicyKey(field, key, text) {
        const spec = POLICY_SPECS[field].find(entry => entry.key === key);
        if (!spec)
            return;
        const parsed = parsePolicyText(field, spec, text);
        if (!parsed.ok) {
            this.policyRaw[field][key] = text;
            this.form.actions().edit(field, this.form.field(field).text);
            return;
        }
        delete this.policyRaw[field][key];
        const next = { ...this.policyDraft(field) };
        if (parsed.value === undefined)
            delete next[key];
        else
            next[key] = parsed.value;
        const minimal = this.minimalPolicy(field, next);
        const spec2 = ALL_FIELD_SPECS.find(entry => entry.field === field);
        const stored = this.scope.getSnapshot().value?.[field];
        const same = JSON.stringify(this.minimalPolicy(field, stored && typeof stored === 'object' ? stored : {})) === JSON.stringify(minimal);
        this.form.actions().edit(field, same ? spec2.format(stored) : JSON.stringify(minimal, null, 2));
    }
    projectPolicies() {
        const out = { usagePolicy: {}, automationAssets: {} };
        for (const field of Object.keys(POLICY_SPECS)) {
            const draft = this.policyDraft(field);
            for (const spec of POLICY_SPECS[field]) {
                const raw = this.policyRaw[field][spec.key];
                const value = draft[spec.key] ?? defaultOf(field, spec.key);
                const parsed = raw === undefined ? undefined : parsePolicyText(field, spec, raw);
                out[field][spec.key] = {
                    text: raw ?? valueText(value),
                    overridden: draft[spec.key] !== undefined && draft[spec.key] !== defaultOf(field, spec.key),
                    ...parsed && !parsed.ok ? { problem: parsed.problem } : {},
                };
            }
        }
        return out;
    }
    // --- login profiles: the list's dialog stages one edit of the `authProfiles` map ------------------------------
    /** Stage a whole `authProfiles` map; the stored map itself is staged back when they are equal, so the form is clean again. */
    stageProfiles(next) {
        const spec = ALL_FIELD_SPECS.find(entry => entry.field === 'authProfiles');
        const stored = this.scope.getSnapshot().value?.authProfiles;
        const canonical = (map) => JSON.stringify(Object.keys(map).sort().map(id => [id, map[id].storageStatePath, [...map[id].allowedDomains], map[id].persistState]));
        const same = canonical(next) === canonical(parseProfiles(spec.format(stored)));
        this.form.actions().edit('authProfiles', same ? spec.format(stored) : JSON.stringify(next, null, 2));
    }
    /** Add or replace one profile. A profile's state-file path is kept as given: the card never rewrites a path it did not create. */
    saveAuthProfile(id, entry) {
        const current = parseProfiles(this.form.field('authProfiles').text);
        this.stageProfiles({ ...current, [id]: { storageStatePath: entry.storageStatePath, allowedDomains: [...entry.allowedDomains], persistState: entry.persistState } });
    }
    /** Remove one profile from the baseline configuration. */
    removeAuthProfile(id) {
        const current = parseProfiles(this.form.field('authProfiles').text);
        delete current[id];
        this.stageProfiles(current);
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
        const properties = this.projectProperties();
        const problems = this.crossProblems();
        return { ...shell, invalid: shell.invalid || this.extrasInvalid || this.policyHasRaw() || properties.invalid || Object.keys(problems).length > 0, problems, policies: this.projectPolicies(), fields, jsonFields, prompts: this.projectPrompts(jsonFields.prompts), properties, changes: this.changedFields() };
    }
    projectPrompts(field) {
        const draft = this.promptsDraft();
        const texts = {};
        for (const entry of PROMPT_TEXT_FIELDS) {
            const value = getAt(draft, entry.path);
            const stored = typeof value === 'string' ? value : '';
            const text = this.promptRaw[entry.id] ?? stored;
            const base = this.promptDefaults()?.texts[entry.id];
            texts[entry.id] = { text, invalid: text.length > entry.limit, sameAsDefault: stored !== '' && stored === base };
        }
        return {
            texts,
            skillEnabled: getAt(draft, ['skill', 'enabled']) !== false,
            extras: { text: this.extrasRaw ?? extrasText(draft), invalid: this.extrasInvalid },
            entries: extraEntries(draft),
            overridden: field.overridden,
            invalid: field.invalid,
        };
    }
}
//# sourceMappingURL=form.js.map