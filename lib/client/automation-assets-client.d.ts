import type { SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client';
import type { ClientConnectionRpc } from '@deepseek-ai/dsh-client-connection/client';
import type { AutomationAsset, AutomationAssetSnapshot, AutomationAssetStatus } from '../automation-assets.ts';
export interface AutomationAssetsState {
    loading: boolean;
    busy: boolean;
    failed: boolean;
    error?: string;
    snapshot?: AutomationAssetSnapshot;
    selected?: AutomationAsset;
}
export declare class AutomationAssetsController {
    private readonly rpc;
    private readonly store;
    private disposed;
    constructor(rpc: ClientConnectionRpc);
    inject(): {
        hooks: {
            automationAssets: SnapshotStore<AutomationAssetsState>;
        };
        refreshAutomationAssets: () => void;
        selectAutomationAsset: (id?: string) => void;
        saveAutomationAsset: (asset: Partial<AutomationAsset> & Pick<AutomationAsset, "kind" | "name">) => Promise<void>;
        summarizeAutomationCandidate: (id: string) => Promise<void>;
        dismissAutomationCandidate: (id: string) => Promise<void>;
        validateAutomationAsset: (id: string) => Promise<void>;
        testAutomationAsset: (id: string, url: string, inputs: Record<string, string>) => Promise<void>;
        setAutomationAssetStatus: (id: string, status: AutomationAssetStatus) => Promise<void>;
    };
    snapshot(): AutomationAssetsState;
    dispose(): void;
    refresh(): Promise<void>;
    select(id?: string): Promise<void>;
    private mutate;
    private call;
    private fail;
    private publish;
}
