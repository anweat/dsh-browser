/**
 * v1 -> v2 recipe conversion.
 *
 * Converting never edits the source asset: it produces the input for a NEW
 * draft that remembers `sourceAssetId` and `sourceRevision`. A v1 selector took
 * the first match; the draft keeps that behaviour on purpose, marked
 * `explicitFirst`, and lists every such step in `pendingDisambiguation` so the
 * author makes each locator unique (or gives it an index and a reason) before
 * the draft is tested and activated.
 * @module dsh-browser/automation-convert
 */
import { type PendingDisambiguation } from './automation-v2.ts';
import type { AutomationAsset } from './automation-assets.ts';
export interface ConversionResult {
    /** Input for `AutomationAssetStore.saveDraft` (no id: always a new draft). */
    draft: Pick<AutomationAsset, 'kind' | 'name'> & Partial<AutomationAsset>;
    /** Every step that still takes the first match. */
    pendingDisambiguation: PendingDisambiguation[];
    /** What changed in meaning or defaults, and what the author still has to add. */
    notes: string[];
}
/** Convert a stored v1 recipe asset into the input of a new v2 draft. The asset itself is only read. */
export declare function convertV1ToV2Draft(asset: AutomationAsset): ConversionResult;
