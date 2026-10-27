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
/** What `runtime` reports: which browser would launch, and whether the optional OpenCLI is installed. */
export interface RuntimeView {
    browser: {
        ready: boolean;
        source: 'custom-executable' | 'channel' | 'playwright-chromium' | 'system-browser' | 'none';
        path?: string;
        note?: string;
        installAdvice?: string;
    };
    systemBrowsers: {
        channel: string;
        name: string;
        path: string;
    }[];
    chromiumInstalled: boolean;
    opencli: {
        enabled: boolean;
        installed: boolean;
        source?: string;
        hint?: string;
    };
}
/** Only a reply of the right shape is used: an older plugin, or a bridge that answers `{}` to every endpoint, must not break the card. */
export declare function isRuntimeView(value: unknown): value is RuntimeView;
export interface PolicyStatusState {
    loading: boolean;
    failed: boolean;
    busy?: boolean;
    /** Why the last clear was refused. */
    error?: string;
    report?: PolicyReportView;
    /** Absent until the first read, and when the plugin is too old to answer (the card then shows nothing about it). */
    runtime?: RuntimeView;
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
    private refreshRuntime;
    clear(scope: 'all' | 'usagePolicy' | 'authProfile', id?: string): Promise<void>;
    private publish;
}
