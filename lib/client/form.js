const textField = (field) => ({
    field,
    format: value => typeof value === 'string' ? value : '',
    parse(text) { return text.trim() === '' ? { kind: 'clear' } : { kind: 'set', value: text.trim() }; },
});
const booleanField = (field) => ({
    field,
    format: value => value === true ? 'true' : 'false',
    parse: text => text === 'true' || text === 'false' ? { kind: 'set', value: text === 'true' } : undefined,
});
const enumField = (field, values) => ({
    field,
    format: value => typeof value === 'string' ? value : values[0] ?? '',
    parse: text => values.includes(text) ? { kind: 'set', value: text } : undefined,
});
const integerField = (field, min, max) => ({
    field,
    format: value => typeof value === 'number' && Number.isInteger(value) ? String(value) : '',
    parse(text) {
        if (text.trim() === '')
            return { kind: 'clear' };
        const value = Number(text);
        return Number.isInteger(value) && value >= min && value <= max ? { kind: 'set', value } : undefined;
    },
});
const stringArrayField = (field) => ({
    field,
    format: value => Array.isArray(value) ? JSON.stringify(value, null, 2) : '',
    parse(text) {
        if (text.trim() === '')
            return { kind: 'clear' };
        try {
            const value = JSON.parse(text);
            return Array.isArray(value) && value.every(entry => typeof entry === 'string')
                ? { kind: 'set', value }
                : undefined;
        }
        catch {
            return undefined;
        }
    },
});
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
    'modelDevelopmentEnabled', 'maxModelDraftWritesPerSession',
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
    return Object.entries(value).every(([key, entry]) => {
        if (!['minSuccessfulRuns', 'minDistinctSessions', 'successWindowDays', 'minSuccessRate', 'maxCandidates', 'candidateTtlDays', 'maxSuggestionsPerDay', 'maxDrafts', 'maxActiveAssets', 'retrievalTopK', 'catalogTokenBudget', 'maxModelDraftWritesPerSession'].includes(key))
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
export const FIELD_SPECS = [
    booleanField('enabled'),
    enumField('automationMode', ['read-only', 'standard', 'autonomous', 'unrestricted']),
    enumField('browserRuntime', ['playwright', 'patchright']),
    textField('channel'),
    integerField('cdpPort', 1, 65_535),
    stringArrayField('args'),
    booleanField('headless'),
    booleanField('opencliEnabled'),
    jsonField('usagePolicy', validUsagePolicy),
    jsonField('automationAssets', validAssetPolicy),
    booleanField('autoInstall'),
    textField('storageStatePath'),
    jsonField('authProfiles'),
    textField('defaultAuthProfile'),
    jsonField('rulePacks'),
    textField('executablePath'),
    textField('snapshotDir'),
    booleanField('verbose'),
];
const SPEC_BY_FIELD = new Map(FIELD_SPECS.map(spec => [spec.field, spec]));
function stable(value) {
    if (Array.isArray(value))
        return `[${value.map(stable).join(',')}]`;
    if (value && typeof value === 'object') {
        return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => `${JSON.stringify(key)}:${stable(entry)}`).join(',')}}`;
    }
    return JSON.stringify(value);
}
function same(left, right) { return stable(left) === stable(right); }
function createLocalStore(initial) {
    let snapshot = initial;
    const listeners = new Set();
    return {
        getSnapshot: () => snapshot,
        subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
        set(next) { snapshot = next; for (const listener of listeners)
            listener(); },
        update(updater) { const draft = structuredClone(snapshot); updater(draft); snapshot = draft; for (const listener of listeners)
            listener(); },
    };
}
export class BrowserSettingsController {
    scope;
    staged = new Map();
    store;
    unsubscribe;
    saving = false;
    failed = false;
    constructor(scope) {
        this.scope = scope;
        this.store = createLocalStore(this.project());
        this.unsubscribe = scope.subscribe(() => { this.publish(); });
    }
    inject() {
        return {
            hooks: { browserSettings: this.store },
            edit: (field, text) => { this.edit(field, text); },
            resetField: (field) => { this.resetField(field); },
            save: () => { void this.save(); },
            discard: () => { this.discard(); },
        };
    }
    snapshot() { return this.store.getSnapshot(); }
    edit(field, text) {
        this.staged.set(field, { text, clear: false });
        this.failed = false;
        this.publish();
    }
    resetField(field) {
        const spec = this.spec(field);
        this.staged.set(field, { text: spec.format(this.baseValue(field)), clear: true });
        this.failed = false;
        this.publish();
    }
    discard() { this.staged.clear(); this.failed = false; this.publish(); }
    async save() {
        const plan = this.plan();
        if (this.saving || plan.some(item => item.write === undefined) || plan.length === 0)
            return;
        this.saving = true;
        this.failed = false;
        this.publish();
        let landed = true;
        try {
            for (const item of plan) {
                if (!item.write) {
                    landed = false;
                    break;
                }
                if (item.write.kind === 'clear') {
                    await this.scope.unset(item.field);
                    landed = !this.stored(item.field) && landed;
                }
                else {
                    await this.scope.set(item.field, item.write.value);
                    landed = same(this.userLayer()?.[item.field], item.write.value) && landed;
                }
            }
        }
        catch {
            landed = false;
        }
        if (landed)
            this.staged.clear();
        this.saving = false;
        this.failed = !landed;
        this.publish();
    }
    dispose() { this.unsubscribe(); }
    project() {
        const fields = {};
        for (const spec of FIELD_SPECS)
            fields[spec.field] = this.field(spec.field);
        const plan = this.plan();
        return {
            available: this.scope.getSnapshot().status === 'ready', writable: this.scope.getSnapshot().writable,
            dirty: plan.length > 0, invalid: plan.some(item => item.write === undefined), saving: this.saving, failed: this.failed, fields,
        };
    }
    field(field) {
        const spec = this.spec(field);
        const draft = this.staged.get(field);
        if (!draft)
            return { text: spec.format(this.sectionValue(field)), overridden: this.stored(field), invalid: false };
        const write = draft.clear ? { kind: 'clear' } : spec.parse(draft.text);
        return { text: draft.text, overridden: write?.kind === 'set', invalid: write === undefined };
    }
    plan() {
        const writes = [];
        for (const [field, draft] of this.staged) {
            const spec = this.spec(field);
            if (draft.clear) {
                if (this.stored(field))
                    writes.push({ field, write: { kind: 'clear' } });
                continue;
            }
            if (draft.text === spec.format(this.sectionValue(field)))
                continue;
            writes.push({ field, write: spec.parse(draft.text) });
        }
        return writes;
    }
    spec(field) {
        const spec = SPEC_BY_FIELD.get(field);
        if (!spec)
            throw new Error(`unknown browser settings field: ${field}`);
        return spec;
    }
    sectionValue(field) { return this.scope.getSnapshot().value?.[field]; }
    baseValue(field) { return this.scope.getSnapshot().base?.[field]; }
    userLayer() { return this.scope.getSnapshot().user; }
    stored(field) { const user = this.userLayer(); return user !== undefined && Object.hasOwn(user, field); }
    publish() { this.store.set(this.project()); }
}
//# sourceMappingURL=form.js.map