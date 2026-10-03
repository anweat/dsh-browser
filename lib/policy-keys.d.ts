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
export declare const ASSET_POLICY_KEYS: readonly ["enabled", "directory", "persistenceMode", "activationMode", "minSuccessfulRuns", "minDistinctSessions", "successWindowDays", "minSuccessRate", "maxCandidates", "candidateTtlDays", "maxSuggestionsPerDay", "maxDrafts", "maxActiveAssets", "retrievalTopK", "catalogTokenBudget", "modelDevelopmentEnabled", "maxModelDraftWritesPerSession", "maxTestCredentials", "minInputSetsForActivation"];
export type AssetPolicyKey = typeof ASSET_POLICY_KEYS[number];
/** The keys of `automationAssets` that are not plain non-negative numbers. */
export declare const ASSET_POLICY_BOOLEAN_KEYS: readonly AssetPolicyKey[];
export declare const ASSET_POLICY_STRING_KEYS: readonly AssetPolicyKey[];
export declare const ASSET_POLICY_ENUMS: Partial<Record<AssetPolicyKey, readonly string[]>>;
/** Numeric keys with a range the card enforces itself; the resolver would otherwise clamp silently. */
export declare const ASSET_POLICY_INTEGER_RANGES: Partial<Record<AssetPolicyKey, readonly [number, number]>>;
/** `usagePolicy`: every key with the inclusive integer range the resolver enforces. */
export declare const USAGE_POLICY_BOUNDS: {
    readonly minDelayMs: readonly [0, 60000];
    readonly maxConcurrency: readonly [1, 8];
    readonly burst: readonly [1, 20];
    readonly maxPagesPerRun: readonly [1, 100];
    readonly maxDepth: readonly [0, 5];
    readonly retryLimit: readonly [0, 5];
    readonly backoffBaseMs: readonly [1, 60000];
    readonly cooldownMs: readonly [100, 300000];
};
export declare const USAGE_POLICY_KEYS: (keyof typeof USAGE_POLICY_BOUNDS)[];
