/**
 * The input-set requirement of activation, as pure functions over stored data.
 *
 * The store enforces it (`AutomationAssetStore.setStatus`) and the settings card explains it next to the Activate
 * button; both call these, so what the card says is what the store will do. Types only, so the card can bundle it.
 * @module dsh-browser/activation-rules
 */
/** How many input sets one test takes. */
export const INPUT_SET_MIN = 2;
export const INPUT_SET_MAX = 5;
/**
 * How many different input sets the credential's passing test covered: its passed sets, one for a plain single run,
 * and enough for any requirement when it is a `legacy` credential synthesized from data written before input sets
 * existed (so upgrading never strands an already-tested asset).
 */
export function inputSetsCovered(credential) {
    if (credential.legacy)
        return Number.POSITIVE_INFINITY;
    return credential.inputSets ? credential.inputSets.filter(entry => entry.passed).length : 1;
}
/** How many inputs the asset declares (typed `inputSchema` for v2, `inputNames` otherwise). Zero means the rule does not apply. */
export function declaredInputs(asset) {
    return Math.max(asset.inputSchema?.length ?? 0, asset.inputNames?.length ?? 0);
}
/** What stands between this asset and activation on input sets, or undefined when nothing does. `credential` is the latest of the current revision. */
export function inputSetShortfall(asset, credential, required) {
    const declared = declaredInputs(asset);
    if (declared === 0)
        return undefined;
    const covered = credential ? inputSetsCovered(credential) : 0;
    return covered < required ? { declared, required, covered } : undefined;
}
//# sourceMappingURL=activation-rules.js.map