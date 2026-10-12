import { localStore } from "./automation-assets-client.js";
import { defaultsFromJson } from "./prompts-form.js";
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
        void this.loadDefaults();
    }
    /** The prompt defaults the form compares with and shows as placeholders; undefined until they are loaded. */
    promptDefaults() { return this.store.getSnapshot().defaultTexts; }
    inject() {
        return {
            hooks: { promptsStatus: this.store },
            refreshPromptsStatus: () => { void this.refresh(); },
            exportPromptDefaults: () => this.exportDefaults(),
            loadPromptDefaults: () => this.loadDefaults(),
            hidePromptDefaults: () => { const { defaults: _defaults, defaultsFailed: _failed, ...rest } = this.store.getSnapshot(); this.publish(rest); },
        };
    }
    snapshot() { return this.store.getSnapshot(); }
    dispose() { this.disposed = true; }
    /** Fetch the default texts (once; a later call reuses them). They feed the placeholders and the "equal to default is no override" rule. */
    async loadDefaults() {
        if (this.store.getSnapshot().defaultsJson !== undefined)
            return;
        try {
            const result = await this.rpc.call(CHANNEL, 'promptsDefaults', {});
            if (!result.ok)
                throw new Error(result.error.message);
            const json = result.value.json;
            const parsed = defaultsFromJson(json);
            const { defaultsFailed: _failed, ...rest } = this.store.getSnapshot();
            this.publish({ ...rest, defaultsJson: json, ...parsed ? { defaultTexts: parsed } : {} });
        }
        catch {
            this.publish({ ...this.store.getSnapshot(), defaultsFailed: true });
        }
    }
    /** Show the default text in the read-only box under the section. */
    async exportDefaults() {
        await this.loadDefaults();
        const current = this.store.getSnapshot();
        if (current.defaultsJson !== undefined)
            this.publish({ ...current, defaults: current.defaultsJson });
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