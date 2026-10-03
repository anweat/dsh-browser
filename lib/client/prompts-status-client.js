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
        };
    }
    snapshot() { return this.store.getSnapshot(); }
    dispose() { this.disposed = true; }
    async refresh() {
        const current = this.store.getSnapshot();
        this.publish({ ...current, loading: true });
        try {
            const result = await this.rpc.call(CHANNEL, 'prompts', {});
            if (!result.ok)
                throw new Error(result.error.message);
            this.publish({ loading: false, failed: false, status: result.value });
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