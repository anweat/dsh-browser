/**
 * Turn a slice of the exploration journal into a v2 recipe draft.
 *
 * The journal is evidence of one exploration, not a trusted recording (the same rule the recording notes in
 * docs/browser-recipe-migration-and-cancellation.md apply): failed and purely observing calls are left out,
 * an action the recipe cannot express is reported as `unmapped` and keeps the draft from being activated,
 * typed values are never guessed (a value that was not retained becomes a required input), and every
 * judgement the builder made is visible in the report. It does not decide that the draft is equivalent to
 * the exploration; the independent replay (`test` with `inputSets`) is what shows that.
 * @module dsh-browser/automation-journal
 */
import type { AutomationAsset } from './automation-assets.ts';
import type { InputSpec, PendingDisambiguation, Postcondition } from './automation-v2.ts';
import type { SessionJournal } from './journal.ts';
import type { BrowserLocatorSpec } from './locator.ts';
export interface JournalParameter {
    seq: number;
    field: string;
    name: string;
    type?: 'string' | 'number';
}
export interface JournalExtract {
    seq: number;
    as: string;
    mode?: 'text' | 'html' | 'links';
    limit?: number;
    dedupe?: boolean;
}
export interface DraftFromJournalArgs {
    fromSeq?: number;
    toSeq?: number;
    exclude?: number[];
    parameters?: JournalParameter[];
    extract?: JournalExtract[];
    name: string;
    description?: string;
    domains?: string[];
    postconditions?: unknown[];
}
export interface JournalWarning {
    code: string;
    seq?: number;
    message: string;
}
export interface JournalDraftReport {
    fromSeq: number;
    toSeq: number;
    steps: number;
    /** False while any journaled action could not become a step. */
    complete: boolean;
    sourceMap: Record<string, number>;
    /** Read-only observe calls: kept in the journal as observation points, never steps. */
    observationPoints: number[];
    excluded: {
        seq: number;
        reason: string;
    }[];
    unmapped: {
        seq: number;
        action: string;
        reason: string;
    }[];
    inputSchema: InputSpec[];
    pendingDisambiguation: {
        step: number;
        seq: number;
        kind: 'positional-index';
        locator: BrowserLocatorSpec;
    }[];
    parameterCandidates: {
        seq: number;
        field: string;
        example: string;
        suggestedName: string;
    }[];
    extractCandidates: {
        seq: number;
        locator?: BrowserLocatorSpec;
        chars?: number;
    }[];
    suggestedPostconditions: Postcondition[];
    suggestedTestUrl?: string;
    domains: string[];
    warnings: JournalWarning[];
}
export interface JournalDraft {
    /** Input for `AutomationDevelopmentService.save`. */
    draft: Partial<AutomationAsset> & Pick<AutomationAsset, 'kind' | 'name'>;
    report: JournalDraftReport;
}
export declare function buildDraftFromJournal(journal: SessionJournal, args: DraftFromJournalArgs): JournalDraft;
export type { PendingDisambiguation };
