function localStore(initial) {
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
export class AutomationAssetsController {
    rpc;
    store = localStore({ loading: true, busy: false, failed: false });
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
            testAutomationAsset: (id, url, inputs) => this.mutate('test', { id, url, inputs }),
            setAutomationAssetStatus: (id, status) => this.mutate('status', { id, status }),
        };
    }
    snapshot() { return this.store.getSnapshot(); }
    dispose() { this.disposed = true; }
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
    async select(id) {
        if (!id) {
            this.publish({ ...this.store.getSnapshot(), selected: undefined });
            return;
        }
        try {
            const selected = await this.call('get', { id });
            this.publish({ ...this.store.getSnapshot(), selected: selected ?? undefined, failed: false, error: undefined });
        }
        catch (error) {
            this.fail(error);
        }
    }
    async mutate(endpoint, payload) {
        this.publish({ ...this.store.getSnapshot(), busy: true, failed: false, error: undefined });
        try {
            const value = await this.call(endpoint, payload);
            const selected = value && typeof value === 'object' && 'id' in value ? value : this.store.getSnapshot().selected;
            const snapshot = await this.call('snapshot', {});
            this.publish({ loading: false, busy: false, failed: false, snapshot, ...selected ? { selected } : {} });
        }
        catch (error) {
            this.fail(error);
        }
    }
    async call(endpoint, payload) {
        const result = await this.rpc.call('/api', `dsh-browser-assets/${endpoint}`, payload);
        if (!result.ok)
            throw new Error(result.error.message);
        return result.value;
    }
    fail(error) {
        this.publish({ ...this.store.getSnapshot(), loading: false, busy: false, failed: true, error: String(error instanceof Error ? error.message : error).slice(0, 300) });
    }
    publish(state) { if (!this.disposed)
        this.store.set(state); }
}
//# sourceMappingURL=automation-assets-client.js.map