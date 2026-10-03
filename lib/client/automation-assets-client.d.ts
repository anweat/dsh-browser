import type { SnapshotStore } from '@deepseek-ai/dsh-client-store';
import type { ClientConnectionRpc } from '@deepseek-ai/dsh-client-connection/client';
import type { AutomationAsset, AutomationAssetSnapshot, AutomationAssetStatus } from '../automation-assets.ts';
/**
 * Which kind of problem a message is about, so the editor can say it differently:
 * `json` the text or test inputs cannot be sent at all (nothing left the page);
 * `backend` the request failed or was refused (storage, activation, a stale revision, a run that did not complete);
 * `validation` the replay ran but the business result did not hold, or nothing checks it (VALIDATION_FAILED / VALIDATION_MISSING);
 * `refused` the editor itself declined (unsaved edits).
 */
export type AssetNoticeKind = 'json' | 'backend' | 'validation' | 'refused';
export interface AssetNotice {
    kind: AssetNoticeKind;
    message: string;
    /** The backend error code when there was one (`VALIDATION_FAILED`, `ACTIVATION_REFUSED`, ...). */
    code?: string;
}
/** What the editor was asked to leave for; held until the person confirms or cancels. */
export type PendingLeave = {
    kind: 'select';
    id?: string;
} | {
    kind: 'new';
    assetKind: AutomationAsset['kind'];
} | {
    kind: 'refresh';
} | {
    kind: 'fork';
    id: string;
};
export interface EditorState {
    /** The textarea content. */
    text: string;
    /** The text the editor was loaded or last saved with; `text` differing from it is what "unsaved" means. */
    baseline: string;
    testUrl: string;
    testInputs: string;
    notice?: AssetNotice;
    /** Set while unsaved edits stand between the person and what they asked for. */
    confirm?: PendingLeave;
}
export interface AutomationAssetsState {
    loading: boolean;
    busy: boolean;
    failed: boolean;
    error?: string;
    snapshot?: AutomationAssetSnapshot;
    selected?: AutomationAsset;
    editor: EditorState;
}
export declare function localStore<T>(initial: T): SnapshotStore<T>;
/** A failed RPC call, with the structured details the Host attached (`errorCode`, `reason`, ...). */
export declare class AssetCallError extends Error {
    readonly details: Record<string, unknown>;
    constructor(message: string, details?: Record<string, unknown>);
    get code(): string | undefined;
}
export declare function noticeFor(error: unknown): AssetNotice;
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
        testAutomationAsset: (id: string, url: string, inputs: Record<string, string>, expectedRevision?: number) => Promise<void>;
        setAutomationAssetStatus: (id: string, status: AutomationAssetStatus, expectedRevision?: number) => Promise<void>;
        editAutomationAsset: (text: string) => void;
        setAssetTestUrl: (value: string) => void;
        setAssetTestInputs: (value: string) => void;
        requestSelectAutomationAsset: (id?: string) => void;
        requestNewAutomationAsset: (assetKind: AutomationAsset["kind"]) => void;
        requestRefreshAutomationAssets: () => void;
        requestForkAutomationAsset: (id: string) => void;
        confirmLeaveAutomationAsset: () => void;
        cancelLeaveAutomationAsset: () => void;
        saveEditedAutomationAsset: () => Promise<AutomationAsset | undefined>;
        saveAndTestAutomationAsset: () => Promise<void>;
        activateAutomationAsset: () => Promise<void>;
    };
    snapshot(): AutomationAssetsState;
    dispose(): void;
    /** Whether the editor holds edits that are not saved. */
    dirty(): boolean;
    refresh(): Promise<void>;
    /** Load one asset into the selection and the editor, replacing whatever the editor held. */
    select(id?: string): Promise<void>;
    private editorFor;
    private requestLeave;
    private confirmLeave;
    private perform;
    private startNew;
    private edit;
    /** Save the editor text as a new revision. Resolves to the saved asset, or undefined when nothing was saved (the notice says why). */
    private saveEdited;
    /**
     * One button, one meaning: whatever is in the editor is what gets tested. Unsaved edits are saved first
     * (a new revision), and the test is pinned to that revision, so the test, its credential and a later
     * activation all refer to the content on screen.
     */
    private saveAndTest;
    /** Activate the revision on screen. Refused while the editor has edits, and the request names the revision. */
    private activate;
    /** Run a call with the busy flag; a failure becomes the editor's notice. */
    private run;
    private reloadSnapshot;
    private mutate;
    private patchEditor;
    private call;
    private fail;
    private publish;
}
