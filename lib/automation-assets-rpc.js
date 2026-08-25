/** Loopback-only Host RPC for the automation asset review UI. */
import { executeAutomationAsset } from "./automation-execution.js";
const CHANNEL = '/dsh-browser-assets';
function record(payload) {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload))
        throw new Error('request payload must be an object');
    if (JSON.stringify(payload).length > 100_000)
        throw new Error('request payload exceeds 100000 characters');
    return payload;
}
function stringField(payload, name) {
    const value = payload[name];
    if (typeof value !== 'string' || value.length < 1 || value.length > 200)
        throw new Error(`${name} must be a non-empty string`);
    return value;
}
export function registerAutomationAssetRpc(ctx, store, service) {
    ctx.inject(['connection'], (connectionCtx) => {
        const connection = connectionCtx.connection;
        const dispose = connection.rpc.handle(CHANNEL, async (endpoint, rawPayload) => {
            try {
                const payload = record(rawPayload);
                let value;
                switch (endpoint) {
                    case 'snapshot':
                        value = store.snapshot();
                        break;
                    case 'get':
                        value = store.get(stringField(payload, 'id')) ?? null;
                        break;
                    case 'save':
                        value = store.saveDraft(payload.asset);
                        break;
                    case 'summarize':
                        value = store.summarizeCandidate(stringField(payload, 'id'));
                        break;
                    case 'dismiss':
                        store.dismissCandidate(stringField(payload, 'id'));
                        value = store.snapshot();
                        break;
                    case 'validate':
                        value = store.validate(stringField(payload, 'id'));
                        break;
                    case 'test': {
                        const result = await executeAutomationAsset(service, store, stringField(payload, 'id'), stringField(payload, 'url'), payload.inputs, 'draft');
                        value = result.asset;
                        break;
                    }
                    case 'status':
                        value = store.setStatus(stringField(payload, 'id'), stringField(payload, 'status'));
                        break;
                    default: return { ok: false, error: { code: 'not-found', message: `unknown automation asset endpoint: ${endpoint}` } };
                }
                return { ok: true, value };
            }
            catch (error) {
                return { ok: false, error: { code: 'bad-request', message: String(error instanceof Error ? error.message : error).slice(0, 500) } };
            }
        }, { authority: 'loopback' });
        connectionCtx.effect(() => dispose, 'dsh-browser: automation asset RPC');
    });
}
//# sourceMappingURL=automation-assets-rpc.js.map