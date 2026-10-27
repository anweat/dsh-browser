import { localStore } from "./automation-assets-client.js";
/** Only a reply of the right shape is used: an older plugin, or a bridge that answers `{}` to every endpoint, must not break the card. */
export function isRuntimeView(value) {
    const view = value;
    return typeof view === 'object' && view !== null && typeof view.browser?.ready === 'boolean' && typeof view.opencli?.installed === 'boolean';
}
const CHANNEL = '/dsh-browser-assets';
/** Reads the policy overlay for the "policy overlay" section and clears it back to the baseline. */
export class PolicyStatusController {
    rpc;
    store = localStore({ loading: true, failed: false });
    disposed = false;
    constructor(rpc) {
        this.rpc = rpc;
        void this.refresh();
    }
    inject() {
        return {
            hooks: { policyStatus: this.store },
            refreshPolicyStatus: () => { void this.refresh(); },
            clearPolicyOverlay: (scope = 'all', id) => this.clear(scope, id),
        };
    }
    snapshot() { return this.store.getSnapshot(); }
    dispose() { this.disposed = true; }
    async refresh() {
        this.publish({ ...this.store.getSnapshot(), loading: true });
        try {
            const result = await this.rpc.call(CHANNEL, 'policy', {});
            if (!result.ok)
                throw new Error(result.error.message);
            this.publish({ ...this.store.getSnapshot(), loading: false, failed: false, report: result.value });
            // The runtime notices come second and never hold the policy report back: a plugin build without the endpoint just has none.
            void this.refreshRuntime();
        }
        catch {
            this.publish({ ...this.store.getSnapshot(), loading: false, failed: true });
        }
    }
    async refreshRuntime() {
        try {
            const result = await this.rpc.call(CHANNEL, 'runtime', {});
            if (result.ok && isRuntimeView(result.value))
                this.publish({ ...this.store.getSnapshot(), runtime: result.value });
        }
        catch { /* optional */ }
    }
    async clear(scope, id) {
        this.publish({ ...this.store.getSnapshot(), busy: true, error: undefined });
        try {
            const result = await this.rpc.call(CHANNEL, 'policyReset', { scope, ...id ? { id } : {}, expectedRevision: this.store.getSnapshot().report?.revision });
            if (!result.ok)
                throw new Error(result.error.message);
            this.publish({ ...this.store.getSnapshot(), busy: false });
        }
        catch (error) {
            this.publish({ ...this.store.getSnapshot(), busy: false, error: String(error instanceof Error ? error.message : error) });
        }
        await this.refresh();
    }
    publish(state) { if (!this.disposed)
        this.store.set(state); }
}
//# sourceMappingURL=policy-status-client.js.map