import { localStore } from "./automation-assets-client.js";
/** Same private channel as the automation assets (see automation-assets-rpc.ts). */
const CHANNEL = '/dsh-browser-assets';
/** Reads the plugin's own account of its prompt overrides, for the "prompt text" section. */
export class PromptsStatusController {
    rpc;
    store = localStore({ loading: true, failed: false });
    disposed = false;
    constructor(rpc) {
        this.rpc = rpc;
        void this.refresh();
    }
    inject() {
        return {
            hooks: { promptsStatus: this.store },
            refreshPromptsStatus: () => { void this.refresh(); },
            exportPromptDefaults: () => this.exportDefaults(),
            hidePromptDefaults: () => { const { defaults: _defaults, defaultsFailed: _failed, ...rest } = this.store.getSnapshot(); this.publish(rest); },
        };
    }
    snapshot() { return this.store.getSnapshot(); }
    dispose() { this.disposed = true; }
    /** Load the default prompt texts as JSON, for the read-only box under the section. */
    async exportDefaults() {
        try {
            const result = await this.rpc.call(CHANNEL, 'promptsDefaults', {});
            if (!result.ok)
                throw new Error(result.error.message);
            const { defaultsFailed: _failed, ...rest } = this.store.getSnapshot();
            this.publish({ ...rest, defaults: result.value.json });
        }
        catch {
            this.publish({ ...this.store.getSnapshot(), defaultsFailed: true });
        }
    }
    async refresh() {
        const current = this.store.getSnapshot();
        this.publish({ ...current, loading: true });
        try {
            const result = await this.rpc.call(CHANNEL, 'prompts', {});
            if (!result.ok)
                throw new Error(result.error.message);
            this.publish({ ...this.store.getSnapshot(), loading: false, failed: false, status: result.value });
        }
        catch {
            // The plugin restarts when a setting is saved; the next refresh finds it again.
            this.publish({ ...this.store.getSnapshot(), loading: false, failed: true });
        }
    }
    publish(state) { if (!this.disposed)
        this.store.set(state); }
}
//# sourceMappingURL=prompts-status-client.js.map