import type { SnapshotStore } from '@deepseek-ai/dsh-client-store';
import type { ClientConnectionRpc } from '@deepseek-ai/dsh-client-connection/client';
import type { PromptsStatus } from '../prompts.ts';
export interface PromptsStatusState {
    loading: boolean;
    failed: boolean;
    /** What the running plugin reports: the overrides in force, the diagnostics, and the L0 estimate. */
    status?: PromptsStatus;
}
/** Reads the plugin's own account of its prompt overrides, for the "prompt text" section. */
export declare class PromptsStatusController {
    private readonly rpc;
    private readonly store;
    private disposed;
    constructor(rpc: ClientConnectionRpc);
    inject(): {
        hooks: {
            promptsStatus: SnapshotStore<PromptsStatusState>;
        };
        refreshPromptsStatus: () => void;
    };
    snapshot(): PromptsStatusState;
    dispose(): void;
    refresh(): Promise<void>;
    private publish;
}
