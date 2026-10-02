/** Model-facing draft development core, independent of Harness tool transport. */
import type { AutomationAsset, AutomationAssetPolicy, AutomationAssetStore } from './automation-assets.ts';
import { type ConversionResult } from './automation-convert.ts';
export type AutomationDraftInput = Partial<AutomationAsset> & Pick<AutomationAsset, 'kind' | 'name'>;
export declare class AutomationDevelopmentService {
    private readonly store;
    private readonly policy;
    private readonly writesBySession;
    constructor(store: AutomationAssetStore, policy: AutomationAssetPolicy);
    get(id: string): AutomationAsset;
    validate(id: string): AutomationAsset;
    save(input: AutomationDraftInput, sessionId: string): AutomationAsset;
    /**
     * Convert a v1 recipe asset (any status) into a NEW v2 draft. The source is only read: its revision,
     * status, and content stay as they were. Counts as one draft write for the session.
     */
    convert(id: string, sessionId: string): {
        draft: AutomationAsset;
        conversion: ConversionResult;
    };
    /**
     * Copy an asset (typically an active one that stopped working) into a new draft that records its source.
     * Counts as one draft write for the session. The source keeps running until the copy replaces it on activation.
     */
    fork(id: string, sessionId: string): AutomationAsset;
    private assertEnabled;
}
