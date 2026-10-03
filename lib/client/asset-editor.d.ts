/**
 * Pure helpers behind the asset editor: what the editor shows, when it counts as changed, and what the
 * latest test vouches for. No React and no RPC, so they can be unit-tested directly.
 * @module dsh-browser/client/asset-editor
 */
import type { AutomationAsset, TestCredential } from '../automation-assets.ts';
/** The saved asset as the editor text starts out: only the editable fields, so a test or a status change never makes it look edited. */
export declare function editableView(asset: AutomationAsset): Record<string, unknown>;
export declare function serializeEditable(asset: AutomationAsset): string;
/** JSON with sorted keys, so reformatting or reordering the text is not an edit. */
export declare function stableJson(value: unknown): string;
/** Whether the editor text differs from the baseline it was loaded from. Text that is not JSON is compared as text. */
export declare function isDirty(text: string, baseline: string): boolean;
export type ParsedEditor = {
    ok: true;
    value: Partial<AutomationAsset> & Pick<AutomationAsset, 'kind' | 'name'>;
} | {
    ok: false;
    message: string;
};
/** Parse the editor text into something saveable, or say why not. */
export declare function parseEditor(text: string): ParsedEditor;
export declare function shortHash(hash: string | undefined): string;
export interface CredentialView {
    /** The most recent credential bound to the asset's current revision, if any. */
    current?: TestCredential;
    /** The most recent credential of any revision, for display. */
    latest?: TestCredential;
    /** The current revision has a passed credential whose hash still matches the asset's content hash. */
    vouches: boolean;
}
export declare function credentialView(asset: AutomationAsset | undefined): CredentialView;
/** What the "test inputs JSON" box holds: one object (one run on the session page) or 2 to 5 objects (each run in a fresh context). */
export type TestInputs = {
    kind: 'single';
    inputs: Record<string, unknown>;
} | {
    kind: 'sets';
    sets: Record<string, unknown>[];
} | {
    kind: 'error';
    message: string;
};
export declare function parseTestInputs(text: string): TestInputs;
/** One input set of the latest test, as the panel lists it. */
export interface InputSetLine {
    set: number;
    passed: boolean;
    status: string;
    inputsDigest: string;
    outputsDigest: string;
}
export declare function inputSetLines(credential: TestCredential | undefined): InputSetLine[];
/** Pairs of sets (1-based) that got the same output from different inputs: what `PARAMETERIZATION_SUSPECT` is about. */
export declare function identicalOutputPairs(credential: TestCredential | undefined): number[][];
