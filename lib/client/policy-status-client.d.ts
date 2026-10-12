import type { SnapshotStore } from '@deepseek-ai/dsh-client-store';
import type { ClientConnectionRpc } from '@deepseek-ai/dsh-client-connection/client';
/** The policy overlay as the plugin reports it (`inspect.policy` shape, see BrowserService.policyReport). */
export interface PolicyReportView {
    revision: number;
    updatedAt?: string;
    overlayActive: boolean;
    warning?: string;
    allowPrivateHosts: boolean;
    authDir: string;
    /** Problems the running plugin found in its configuration (values that were dropped and why). */
    configWarnings?: string[];
    authProfiles: {
        id: string;
        origin: 'baseline' | 'overlay-changed' | 'overlay-created';
        allowedDomains: string[];
        persistState: boolean;
        storageStatePath?: string;
        overriddenFields?: string[];
    }[];
    removedByOverlay: string[];
    usagePolicy: Record<string, {
        value: number;
        baseline: number;
        overridden: boolean;
    }>;
    audit: {
        revision: number;
        at: string;
        source: 'agent' | 'panel';
        session?: string;
        action: string;
        reason: string;
        direction: 'tighten' | 'loosen' | 'none';
        changes: string[];
    }[];
}
export interface PolicyStatusState {
    loading: boolean;
    failed: boolean;
    busy?: boolean;
    /** Why the last clear was refused. */
    error?: string;
    report?: PolicyReportView;
}
/** Reads the policy overlay for the "policy overlay" section and clears it back to the baseline. */
export declare class PolicyStatusController {
    private readonly rpc;
    private readonly store;
    private disposed;
    constructor(rpc: ClientConnectionRpc);
    inject(): {
        hooks: {
            policyStatus: SnapshotStore<PolicyStatusState>;
        };
        refreshPolicyStatus: () => void;
        clearPolicyOverlay: (scope?: "all" | "usagePolicy" | "authProfile", id?: string) => Promise<void>;
    };
    snapshot(): PolicyStatusState;
    dispose(): void;
    refresh(): Promise<void>;
    clear(scope: 'all' | 'usagePolicy' | 'authProfile', id?: string): Promise<void>;
    private publish;
}
