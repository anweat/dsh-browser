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
/** The name of a login profile: starts with a letter or digit, then letters, digits, `_` and `-`, at most 40 characters. The policy overlay and the settings card use this one rule. */
export const AUTH_PROFILE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,39}$/;
/** `usagePolicy` defaults (what a missing key means). test/policy-keys.test.ts holds them equal to the resolver's. */
export const USAGE_POLICY_DEFAULTS = {
    minDelayMs: 750, maxConcurrency: 2, burst: 3, maxPagesPerRun: 20, maxDepth: 2, retryLimit: 2, backoffBaseMs: 1_000, cooldownMs: 30_000,
};
/**
 * `automationAssets` defaults and the inclusive range of each number. The resolver CLAMPS a value outside its range
 * without a word; the card shows the range and refuses such a value instead. `directory` has no default (the plugin
 * picks one under $DSH_HOME).
 */
export const ASSET_POLICY_DEFAULTS = {
    enabled: true, persistenceMode: 'suggest', activationMode: 'manual', minSuccessfulRuns: 3, minDistinctSessions: 2, successWindowDays: 14,
    minSuccessRate: 0.8, maxCandidates: 20, candidateTtlDays: 14, maxSuggestionsPerDay: 2, maxDrafts: 10, maxActiveAssets: 50, retrievalTopK: 5,
    catalogTokenBudget: 800, modelDevelopmentEnabled: true, maxModelDraftWritesPerSession: 3, maxTestCredentials: 5, minInputSetsForActivation: 2,
};
export const ASSET_POLICY_BOUNDS = {
    minSuccessfulRuns: [2, 20], minDistinctSessions: [1, 10], successWindowDays: [1, 90], minSuccessRate: [0.5, 1], maxCandidates: [1, 100],
    candidateTtlDays: [1, 90], maxSuggestionsPerDay: [0, 20], maxDrafts: [1, 100], maxActiveAssets: [1, 200], retrievalTopK: [1, 20],
    catalogTokenBudget: [100, 4_000], maxModelDraftWritesPerSession: [1, 20], maxTestCredentials: [1, 20], minInputSetsForActivation: [1, 5],
};
//# sourceMappingURL=policy-keys.js.map