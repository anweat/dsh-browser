/** Model-facing draft development core, independent of Harness tool transport. */
import type { AutomationAsset, AutomationAssetPolicy, AutomationAssetStore } from './automation-assets.ts';
export type AutomationDraftInput = Partial<AutomationAsset> & Pick<AutomationAsset, 'kind' | 'name'>;
export declare class AutomationDevelopmentService {
    private readonly store;
    private readonly policy;
    private readonly writesBySession;
    constructor(store: AutomationAssetStore, policy: AutomationAssetPolicy);
    get(id: string): AutomationAsset;
    validate(id: string): AutomationAsset;
    save(input: AutomationDraftInput, sessionId: string): AutomationAsset;
    private assertEnabled;
}
