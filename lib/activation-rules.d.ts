/**
 * The input-set requirement of activation, as pure functions over stored data.
 *
 * The store enforces it (`AutomationAssetStore.setStatus`) and the settings card explains it next to the Activate
 * button; both call these, so what the card says is what the store will do. Types only, so the card can bundle it.
 * @module dsh-browser/activation-rules
 */
import type { AutomationAsset, TestCredential } from './automation-assets.ts';
/** How many input sets one test takes. */
export declare const INPUT_SET_MIN = 2;
export declare const INPUT_SET_MAX = 5;
/**
 * How many different input sets the credential's passing test covered: its passed sets, one for a plain single run,
 * and enough for any requirement when it is a `legacy` credential synthesized from data written before input sets
 * existed (so upgrading never strands an already-tested asset).
 */
export declare function inputSetsCovered(credential: Pick<TestCredential, 'legacy' | 'inputSets'>): number;
/** How many inputs the asset declares (typed `inputSchema` for v2, `inputNames` otherwise). Zero means the rule does not apply. */
export declare function declaredInputs(asset: Pick<AutomationAsset, 'inputSchema' | 'inputNames'>): number;
export interface InputSetShortfall {
    /** Inputs the asset declares. */
    declared: number;
    /** Input sets the activation needs the passing test to have covered. */
    required: number;
    /** Input sets the test of the current revision covered. */
    covered: number;
}
/** What stands between this asset and activation on input sets, or undefined when nothing does. `credential` is the latest of the current revision. */
export declare function inputSetShortfall(asset: Pick<AutomationAsset, 'inputSchema' | 'inputNames'>, credential: Pick<TestCredential, 'legacy' | 'inputSets'> | undefined, required: number): InputSetShortfall | undefined;
