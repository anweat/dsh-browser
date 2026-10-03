/**
 * The keys of the two JSON policy objects, in one place.
 *
 * The settings card validates what a person types into the "automation asset policy" and "usage buffer" boxes against
 * these lists and prints them under the boxes, so a key added to a policy is added here once. This module has no
 * imports on purpose: the card bundles it for the browser. test/policy-keys.test.ts holds the lists equal to what the
 * resolvers return and to the Host Config schema.
 * @module dsh-browser/policy-keys
 */
/** Every key of `automationAssets`, in documentation order. */
export const ASSET_POLICY_KEYS = [
    'enabled', 'directory', 'persistenceMode', 'activationMode', 'minSuccessfulRuns', 'minDistinctSessions',
    'successWindowDays', 'minSuccessRate', 'maxCandidates', 'candidateTtlDays', 'maxSuggestionsPerDay',
    'maxDrafts', 'maxActiveAssets', 'retrievalTopK', 'catalogTokenBudget',
    'modelDevelopmentEnabled', 'maxModelDraftWritesPerSession', 'maxTestCredentials', 'minInputSetsForActivation',
];
/** The keys of `automationAssets` that are not plain non-negative numbers. */
export const ASSET_POLICY_BOOLEAN_KEYS = ['enabled', 'modelDevelopmentEnabled'];
export const ASSET_POLICY_STRING_KEYS = ['directory'];
export const ASSET_POLICY_ENUMS = {
    persistenceMode: ['off', 'manual', 'suggest', 'auto-draft'],
    activationMode: ['manual', 'auto-tested'],
};
/** Numeric keys with a range the card enforces itself; the resolver would otherwise clamp silently. */
export const ASSET_POLICY_INTEGER_RANGES = {
    minInputSetsForActivation: [1, 5],
};
/** `usagePolicy`: every key with the inclusive integer range the resolver enforces. */
export const USAGE_POLICY_BOUNDS = {
    minDelayMs: [0, 60_000], maxConcurrency: [1, 8], burst: [1, 20], maxPagesPerRun: [1, 100],
    maxDepth: [0, 5], retryLimit: [0, 5], backoffBaseMs: [1, 60_000], cooldownMs: [100, 300_000],
};
export const USAGE_POLICY_KEYS = Object.keys(USAGE_POLICY_BOUNDS);
//# sourceMappingURL=policy-keys.js.map