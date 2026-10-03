/** Model-facing draft development core, independent of Harness tool transport. */
import type { AutomationAsset, AutomationAssetPolicy, AutomationAssetStore } from './automation-assets.ts';
import { type ConversionResult } from './automation-convert.ts';
import { type DraftFromJournalArgs, type JournalDraftReport } from './automation-journal.ts';
import type { SessionJournal } from './journal.ts';
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
     * Build a v2 draft from a slice of the session's exploration journal and save it (one draft write; pass `id` to
     * replace a draft from an earlier call). The report says what became a step, what was left out and why.
     */
    draftFromJournal(journal: SessionJournal, args: DraftFromJournalArgs & {
        id?: string;
    }, sessionId: string): {
        asset: AutomationAsset;
        report: JournalDraftReport;
    };
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
