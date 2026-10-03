import { isDirty, parseEditor, parseTestInputs, serializeEditable } from "./asset-editor.js";
const EMPTY_EDITOR = { text: '', baseline: '', testUrl: '', testInputs: '{}' };
export function localStore(initial) {
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
/** This plugin's private RPC channel, matching the Host half. */
const CHANNEL = '/dsh-browser-assets';
/** A failed RPC call, with the structured details the Host attached (`errorCode`, `reason`, ...). */
export class AssetCallError extends Error {
    details;
    constructor(message, details = {}) {
        super(message);
        this.details = details;
        this.name = 'AssetCallError';
    }
    get code() { return typeof this.details.errorCode === 'string' ? this.details.errorCode : undefined; }
}
const VALIDATION_CODES = new Set(['VALIDATION_FAILED', 'VALIDATION_MISSING']);
export function noticeFor(error) {
    const message = String(error instanceof Error ? error.message : error).slice(0, 400);
    const code = error instanceof AssetCallError ? error.code : undefined;
    return { kind: code && VALIDATION_CODES.has(code) ? 'validation' : 'backend', message, ...code ? { code } : {} };
}
/**
 * The "new recipe" template: schema v2 (typed inputs, locators, a result to extract and a postcondition that checks it),
 * so what a person starts from is what the plugin writes today. Every value is a placeholder to replace; the template
 * itself passes the save validation, which test/automation-assets-client.test.ts holds it to.
 */
export const NEW_RECIPE = {
    kind: 'recipe', schemaVersion: 2, name: 'New recipe', description: '', domains: ['example.com'], tags: [],
    inputSchema: [{ name: 'keyword', type: 'string', required: true, example: 'example' }],
    recipe: [
        { type: 'fill', locator: { label: 'Search' }, value: '{{keyword}}' },
        { type: 'click', locator: { role: 'button', name: 'Search' } },
        { type: 'extract', locator: { css: '#results' }, as: 'results' },
    ],
    postconditions: [{ output: 'results', nonEmpty: true }],
};
const NEW_SCRIPT = {
    kind: 'userscript', name: 'New userscript', description: '', domains: [], tags: [], inputNames: [],
    source: '// ==UserScript==\n// @name New userscript\n// @match https://example.com/*\n// @grant none\n// ==/UserScript==\nreturn { title: document.title }',
};
export class AutomationAssetsController {
    rpc;
    store = localStore({ loading: true, busy: false, failed: false, editor: EMPTY_EDITOR });
    disposed = false;
    constructor(rpc) {
        this.rpc = rpc;
        void this.refresh();
    }
    inject() {
        return {
            hooks: { automationAssets: this.store },
            refreshAutomationAssets: () => { void this.refresh(); },
            selectAutomationAsset: (id) => { void this.select(id); },
            saveAutomationAsset: (asset) => this.mutate('save', { asset }),
            summarizeAutomationCandidate: (id) => this.mutate('summarize', { id }),
            dismissAutomationCandidate: (id) => this.mutate('dismiss', { id }),
            validateAutomationAsset: (id) => this.mutate('validate', { id }),
            testAutomationAsset: (id, url, inputs, expectedRevision) => this.mutate('test', { id, url, inputs, ...expectedRevision !== undefined ? { expectedRevision } : {} }),
            setAutomationAssetStatus: (id, status, expectedRevision) => this.mutate('status', { id, status, ...expectedRevision !== undefined ? { expectedRevision } : {} }),
            // The editor: every way of leaving unsaved edits goes through a request/confirm pair.
            editAutomationAsset: (text) => this.edit(text),
            setAssetTestUrl: (value) => this.patchEditor({ testUrl: value, notice: undefined }),
            setAssetTestInputs: (value) => this.patchEditor({ testInputs: value, notice: undefined }),
            requestSelectAutomationAsset: (id) => this.requestLeave({ kind: 'select', id }),
            requestNewAutomationAsset: (assetKind) => this.requestLeave({ kind: 'new', assetKind }),
            requestRefreshAutomationAssets: () => this.requestLeave({ kind: 'refresh' }),
            requestForkAutomationAsset: (id) => this.requestLeave({ kind: 'fork', id }),
            requestConvertAutomationAsset: (id) => this.requestLeave({ kind: 'convert', id }),
            confirmLeaveAutomationAsset: () => this.confirmLeave(),
            cancelLeaveAutomationAsset: () => this.patchEditor({ confirm: undefined }),
            saveEditedAutomationAsset: () => this.saveEdited(),
            saveAndTestAutomationAsset: () => this.saveAndTest(),
            activateAutomationAsset: () => this.activate(),
        };
    }
    snapshot() { return this.store.getSnapshot(); }
    dispose() { this.disposed = true; }
    /** Whether the editor holds edits that are not saved. */
    dirty() {
        const { editor } = this.store.getSnapshot();
        return isDirty(editor.text, editor.baseline);
    }
    // --- loading -------------------------------------------------------------
    async refresh() {
        this.publish({ ...this.store.getSnapshot(), loading: true, failed: false, error: undefined });
        try {
            const snapshot = await this.call('snapshot', {});
            this.publish({ ...this.store.getSnapshot(), loading: false, snapshot });
        }
        catch (error) {
            this.fail(error);
        }
    }
    /** Load one asset into the selection and the editor, replacing whatever the editor held. */
    async select(id) {
        if (!id) {
            this.publish({ ...this.store.getSnapshot(), selected: undefined, editor: { ...this.store.getSnapshot().editor, text: '', baseline: '', notice: undefined, confirm: undefined } });
            return;
        }
        try {
            const selected = await this.call('get', { id });
            this.publish({ ...this.store.getSnapshot(), selected: selected ?? undefined, failed: false, error: undefined, editor: this.editorFor(selected ?? undefined) });
        }
        catch (error) {
            this.fail(error);
        }
    }
    editorFor(asset) {
        const previous = this.store.getSnapshot().editor;
        const text = asset ? serializeEditable(asset) : '';
        return { text, baseline: text, testUrl: previous.testUrl, testInputs: previous.testInputs };
    }
    // --- leaving the editor --------------------------------------------------
    requestLeave(leave) {
        if (this.dirty()) {
            this.patchEditor({ confirm: leave });
            return;
        }
        void this.perform(leave);
    }
    confirmLeave() {
        const leave = this.store.getSnapshot().editor.confirm;
        this.patchEditor({ confirm: undefined });
        if (leave)
            void this.perform(leave);
    }
    async perform(leave) {
        switch (leave.kind) {
            case 'select':
                await this.select(leave.id);
                return;
            case 'new':
                this.startNew(leave.assetKind);
                return;
            case 'refresh': {
                await this.refresh();
                const id = this.store.getSnapshot().selected?.id;
                if (id)
                    await this.select(id);
                return;
            }
            case 'fork': {
                const draft = await this.run(() => this.call('fork', { id: leave.id }));
                if (draft) {
                    await this.reloadSnapshot();
                    this.publish({ ...this.store.getSnapshot(), selected: draft, editor: this.editorFor(draft) });
                }
                return;
            }
            case 'convert': {
                const sourceName = this.store.getSnapshot().snapshot?.assets.find(entry => entry.id === leave.id)?.name ?? this.store.getSnapshot().selected?.name ?? '';
                const result = await this.run(() => this.call('convert', { id: leave.id }));
                if (result) {
                    await this.reloadSnapshot();
                    this.publish({ ...this.store.getSnapshot(), selected: result.draft, editor: { ...this.editorFor(result.draft), converted: { sourceName, notes: result.notes } } });
                }
            }
        }
    }
    startNew(assetKind) {
        const text = JSON.stringify(assetKind === 'recipe' ? NEW_RECIPE : NEW_SCRIPT, null, 2);
        const current = this.store.getSnapshot();
        this.publish({ ...current, selected: undefined, editor: { text, baseline: text, testUrl: current.editor.testUrl, testInputs: current.editor.testInputs } });
    }
    // --- editing, saving, testing, activating --------------------------------
    edit(text) { this.patchEditor({ text, notice: undefined }); }
    /** Save the editor text as a new revision. Resolves to the saved asset, or undefined when nothing was saved (the notice says why). */
    async saveEdited() {
        const { editor, selected } = this.store.getSnapshot();
        const parsed = parseEditor(editor.text);
        if (!parsed.ok) {
            this.patchEditor({ notice: { kind: 'json', message: parsed.message } });
            return undefined;
        }
        if (selected?.status === 'active') {
            this.patchEditor({ notice: { kind: 'refused', message: 'active assets cannot be edited: create a repair draft first' } });
            return undefined;
        }
        const value = parsed.value;
        if (selected?.id)
            value.id = selected.id;
        const saved = await this.run(() => this.call('save', { asset: value }));
        if (!saved)
            return undefined;
        await this.reloadSnapshot();
        this.publish({ ...this.store.getSnapshot(), selected: saved, editor: { ...this.editorFor(saved), notice: undefined } });
        return saved;
    }
    /**
     * One button, one meaning: whatever is in the editor is what gets tested. Unsaved edits are saved first
     * (a new revision), and the test is pinned to that revision, so the test, its credential and a later
     * activation all refer to the content on screen.
     */
    async saveAndTest() {
        const state = this.store.getSnapshot();
        const url = state.editor.testUrl.trim();
        const parsedInputs = parseTestInputs(state.editor.testInputs);
        if (parsedInputs.kind === 'error') {
            this.patchEditor({ notice: { kind: 'json', message: parsedInputs.message } });
            return;
        }
        if (!url) {
            this.patchEditor({ notice: { kind: 'json', message: 'enter the test URL first' } });
            return;
        }
        let target = state.selected;
        if (this.dirty() || !target) {
            target = await this.saveEdited();
            if (!target)
                return;
        }
        if (target.status !== 'draft') {
            this.patchEditor({ notice: { kind: 'refused', message: 'only drafts can be tested' } });
            return;
        }
        const id = target.id;
        const revision = target.revision;
        this.publish({ ...this.store.getSnapshot(), busy: true });
        try {
            // One object is one run on the session page; an array is 2 to 5 runs, each in a fresh context.
            const body = parsedInputs.kind === 'sets' ? { inputSets: parsedInputs.sets } : { inputs: parsedInputs.inputs };
            const tested = await this.call('test', { id, url, ...body, expectedRevision: revision });
            await this.reloadSnapshot();
            this.publish({ ...this.store.getSnapshot(), busy: false, selected: tested, editor: { ...this.store.getSnapshot().editor, notice: undefined } });
        }
        catch (error) {
            // The failed replay left a credential behind; show it, and keep the edits.
            const notice = noticeFor(error);
            await this.reloadSnapshot();
            let selected = this.store.getSnapshot().selected;
            try {
                selected = (await this.call('get', { id })) ?? selected;
            }
            catch { /* keep what is shown */ }
            this.publish({ ...this.store.getSnapshot(), busy: false, selected, editor: { ...this.store.getSnapshot().editor, notice } });
        }
    }
    /** Activate the revision on screen. Refused while the editor has edits, and the request names the revision. */
    async activate() {
        const { selected } = this.store.getSnapshot();
        if (!selected)
            return;
        if (this.dirty()) {
            this.patchEditor({ notice: { kind: 'refused', message: 'save and test your edits before activating' } });
            return;
        }
        const activated = await this.run(() => this.call('status', { id: selected.id, status: 'active', expectedRevision: selected.revision }));
        if (!activated)
            return;
        await this.reloadSnapshot();
        this.publish({ ...this.store.getSnapshot(), selected: activated, editor: { ...this.editorFor(activated), notice: undefined } });
    }
    // --- plumbing ------------------------------------------------------------
    /** Run a call with the busy flag; a failure becomes the editor's notice. */
    async run(fn) {
        this.publish({ ...this.store.getSnapshot(), busy: true });
        try {
            const value = await fn();
            this.publish({ ...this.store.getSnapshot(), busy: false });
            return value;
        }
        catch (error) {
            this.publish({ ...this.store.getSnapshot(), busy: false, editor: { ...this.store.getSnapshot().editor, notice: noticeFor(error) } });
            return undefined;
        }
    }
    async reloadSnapshot() {
        try {
            const snapshot = await this.call('snapshot', {});
            this.publish({ ...this.store.getSnapshot(), snapshot });
        }
        catch { /* the list is stale until the next refresh */ }
    }
    async mutate(endpoint, payload) {
        this.publish({ ...this.store.getSnapshot(), busy: true, failed: false, error: undefined });
        const before = this.store.getSnapshot().selected;
        try {
            const value = await this.call(endpoint, payload);
            const selected = value && typeof value === 'object' && 'id' in value ? value : before;
            const snapshot = await this.call('snapshot', {});
            // Calls made through the plain API (validate, status, ...) never replace text the person is still editing.
            const replaced = !!selected && selected.id !== before?.id;
            const now = this.store.getSnapshot();
            this.publish({ ...now, loading: false, busy: false, failed: false, error: undefined, snapshot, ...selected ? { selected } : {}, ...replaced ? { editor: this.editorFor(selected) } : {} });
        }
        catch (error) {
            const now = this.store.getSnapshot();
            this.publish({ ...now, loading: false, busy: false, failed: false, error: undefined, editor: { ...now.editor, notice: noticeFor(error) } });
        }
    }
    patchEditor(patch) {
        const current = this.store.getSnapshot();
        this.publish({ ...current, editor: { ...current.editor, ...patch } });
    }
    async call(endpoint, payload) {
        // The plugin's own logical channel: the shared `/api` channel is reserved
        // for host-composed endpoints, and intercepting it there replaced the whole
        // channel's fallback (see automation-assets-rpc.ts).
        const result = await this.rpc.call(CHANNEL, endpoint, payload);
        if (!result.ok)
            throw new AssetCallError(result.error.message, (result.error.details ?? {}));
        return result.value;
    }
    fail(error) {
        this.publish({ ...this.store.getSnapshot(), loading: false, busy: false, failed: true, error: String(error instanceof Error ? error.message : error).slice(0, 300) });
    }
    publish(state) { if (!this.disposed)
        this.store.set(state); }
}
//# sourceMappingURL=automation-assets-client.js.map