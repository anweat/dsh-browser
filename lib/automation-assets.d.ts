/** Bounded, local automation-asset lifecycle and retrieval. */
import { type AnyRecipeStep, type BrowserRecipeStep, type RecipeExecutionStatus, type RecipeValidationStatus } from './automation.ts';
import { type InputSpec, type OutputSpec, type PendingDisambiguation, type Postcondition } from './automation-v2.ts';
export declare const ASSET_PERSISTENCE_MODES: readonly ["off", "manual", "suggest", "auto-draft"];
export type AssetPersistenceMode = typeof ASSET_PERSISTENCE_MODES[number];
export declare const ASSET_ACTIVATION_MODES: readonly ["manual", "auto-tested"];
export type AssetActivationMode = typeof ASSET_ACTIVATION_MODES[number];
export type AutomationAssetKind = 'recipe' | 'userscript';
export type AutomationAssetStatus = 'draft' | 'active' | 'archived';
/**
 * How strongly the last passing test confirmed the result. `verified`: a recipe
 * with assert steps ran and every one held. `legacy-unverified`: the steps ran
 * without raising, but nothing checked the outcome (recipes without an assert
 * step, UserScripts, and every asset saved before B2). A missing value on stored
 * data means `legacy-unverified`.
 */
export type EvidenceLevel = 'verified' | 'legacy-unverified';
/** Recipe/UserScript test credentials kept per asset unless `maxTestCredentials` says otherwise. */
export declare const DEFAULT_TEST_CREDENTIALS = 5;
/**
 * What one runtime test proved, bound to the exact content it ran against. Activation trusts
 * only a credential whose revision and contentHash match the asset as it is now.
 * Inputs are kept as a digest, never as values.
 */
export interface TestCredential {
    revision: number;
    /** {@link computeContentHash} of the content that was tested. */
    contentHash: string;
    /** sha256 of the typed inputSchema (or of the declared input names for v1 and UserScripts). */
    inputSchemaHash: string;
    schemaVersion: 1 | 2;
    testedAt: string;
    /** Truncated sha256 of the canonical inputs the test ran with. */
    inputsDigest: string;
    executionStatus: RecipeExecutionStatus;
    validationStatus: RecipeValidationStatus;
    evidenceLevel: EvidenceLevel;
    /** The test counted as passed: it completed, nothing failed, and (v2) something verified the result. */
    passed: boolean;
    /** Synthesized when data written before B4 was loaded: `testStatus` was `passed` and nothing else is known. */
    legacy?: true;
    /** A test with several input sets (each in a fresh context): one entry per set that ran. Digests only. */
    inputSets?: {
        index: number;
        inputsDigest: string;
        passed: boolean;
        executionStatus: RecipeExecutionStatus;
        validationStatus: RecipeValidationStatus;
        outputsDigest: string;
    }[];
    /** How many sets the test was asked to run (more than `inputSets.length` when a failing set stopped it). */
    plannedSets?: number;
    /** Cautions on a passing test, e.g. `PARAMETERIZATION_SUSPECT`: different inputs gave identical outputs. */
    warnings?: string[];
}
export interface AutomationAssetPolicyInput {
    enabled?: boolean;
    directory?: string;
    persistenceMode?: AssetPersistenceMode;
    activationMode?: AssetActivationMode;
    minSuccessfulRuns?: number;
    minDistinctSessions?: number;
    successWindowDays?: number;
    minSuccessRate?: number;
    maxCandidates?: number;
    candidateTtlDays?: number;
    maxSuggestionsPerDay?: number;
    maxDrafts?: number;
    maxActiveAssets?: number;
    retrievalTopK?: number;
    catalogTokenBudget?: number;
    modelDevelopmentEnabled?: boolean;
    maxModelDraftWritesPerSession?: number;
    /** How many test credentials each asset keeps (the most recent ones). Default 5. */
    maxTestCredentials?: number;
    /**
     * How many input sets the passing test of an asset that declares inputs must have covered before it can be activated
     * (1 to 5, default 2). Assets without inputs are not affected.
     */
    minInputSetsForActivation?: number;
}
export interface AutomationAssetPolicy {
    enabled: boolean;
    directory: string;
    persistenceMode: AssetPersistenceMode;
    activationMode: AssetActivationMode;
    minSuccessfulRuns: number;
    minDistinctSessions: number;
    successWindowDays: number;
    minSuccessRate: number;
    maxCandidates: number;
    candidateTtlDays: number;
    maxSuggestionsPerDay: number;
    maxDrafts: number;
    maxActiveAssets: number;
    retrievalTopK: number;
    catalogTokenBudget: number;
    modelDevelopmentEnabled: boolean;
    maxModelDraftWritesPerSession: number;
    maxTestCredentials: number;
    minInputSetsForActivation: number;
}
export interface AutomationCandidate {
    id: string;
    fingerprint: string;
    domain: string;
    title: string;
    steps: BrowserRecipeStep[];
    successfulRuns: number;
    failedRuns: number;
    sessionIds: string[];
    firstSeenAt: string;
    lastSeenAt: string;
    suggestedAt?: string;
    dismissedAt?: string;
}
export interface AutomationAsset {
    id: string;
    kind: AutomationAssetKind;
    status: AutomationAssetStatus;
    name: string;
    description: string;
    domains: string[];
    tags: string[];
    inputNames: string[];
    /** v1 steps (`selector`, first match) or, when `schemaVersion` is 2, {@link BrowserRecipeStepV2}. */
    recipe?: AnyRecipeStep[];
    source?: string;
    /** Recipe schema. Absent means 1: `.first()` locating and the v1 fill rule, unchanged. */
    schemaVersion?: 1 | 2;
    /** v2: typed inputs. When present they are validated and converted at run time. */
    inputSchema?: InputSpec[];
    /** v2: named, typed outputs of `extract` steps with `as`. */
    outputSchema?: OutputSpec[];
    /** v2: conditions that must hold after the steps for the result to count as verified. */
    postconditions?: Postcondition[];
    /** v2: recorded only; not enforced yet. */
    requiredCapabilities?: string[];
    /** v2 converted from v1: steps that still take the first match and should be made unique. Derived from the recipe on save. */
    pendingDisambiguation?: PendingDisambiguation[];
    /** Set when this draft was converted from another asset; the source is never modified. */
    sourceAssetId?: string;
    sourceRevision?: number;
    /**
     * Set on a draft built from an exploration journal (`draft_from_journal`). `unmapped` counts the journaled
     * actions that could not become steps; while it is above zero the draft is a half-finished copy of the
     * exploration and cannot be activated. Saving the draft again with an explicit recipe replaces it and drops this.
     */
    origin?: {
        kind: 'journal';
        fromSeq: number;
        toSeq: number;
        unmapped: number;
    };
    /** Bumped by every save, never reused. */
    revision: number;
    /** sha256 over the recipe or source, schemaVersion, inputSchema, outputSchema, postconditions and domains. Derived; recomputed on load. */
    contentHash?: string;
    /** The most recent runtime tests, oldest first. Activation checks the one bound to the current revision. */
    testCredentials?: TestCredential[];
    testStatus: 'untested' | 'passed' | 'failed';
    testMessage?: string;
    /** Optional on stored data; absent means `legacy-unverified`. Set only by a passing runtime test. */
    evidenceLevel?: EvidenceLevel;
    successCount: number;
    failureCount: number;
    createdAt: string;
    updatedAt: string;
    lastRunAt?: string;
}
export interface AutomationAssetSummary {
    id: string;
    kind: AutomationAssetKind;
    status: AutomationAssetStatus;
    name: string;
    description: string;
    domains: string[];
    tags: string[];
    inputNames: string[];
    /** Only present for schema v2 assets. */
    schemaVersion?: 2;
    /** v2 assets: the typed inputs a caller must pass to automation.run. */
    inputSchema?: InputSpec[];
    revision: number;
    testStatus: AutomationAsset['testStatus'];
    successCount: number;
    failureCount: number;
    updatedAt: string;
    lastRunAt?: string;
}
export interface AutomationCandidateSummary {
    id: string;
    domain: string;
    title: string;
    successfulRuns: number;
    failedRuns: number;
    distinctSessions: number;
    firstSeenAt: string;
    lastSeenAt: string;
    suggestedAt?: string;
    dismissedAt?: string;
}
export interface AutomationAssetSnapshot {
    policy: Omit<AutomationAssetPolicy, 'directory'>;
    candidates: AutomationCandidateSummary[];
    assets: AutomationAssetSummary[];
}
export declare function defaultAutomationAssetDirectory(): string;
export declare function resolveAutomationAssetPolicy(input?: AutomationAssetPolicyInput): AutomationAssetPolicy;
type HashedContent = Pick<AutomationAsset, 'kind' | 'recipe' | 'source' | 'schemaVersion' | 'inputSchema' | 'outputSchema' | 'postconditions' | 'domains'>;
/**
 * What a test vouches for: the steps or source, the schema version and the three v2 contracts, and the
 * domains it may run on. Name, description, tags and counters are not content. Domains are a set.
 */
export declare function computeContentHash(asset: HashedContent): string;
/** A digest of the inputs a test ran with. The values themselves are never stored. */
export declare function digestInputs(inputs: unknown): string;
/** Why an activation request was refused; the message says what to do. */
export type ActivationRefusal = 'expected-revision-required' | 'revision-mismatch' | 'not-tested' | 'test-failed' | 'content-changed' | 'no-domain' | 'limit-reached' | 'incomplete-draft' | 'insufficient-input-sets';
export declare class ActivationRefusedError extends Error {
    readonly reason: ActivationRefusal;
    constructor(reason: ActivationRefusal, message: string);
}
/** Remove concrete form values and non-semantic output from a successful recipe. */
export declare function normalizeRecipeForCandidate(steps: BrowserRecipeStep[]): BrowserRecipeStep[];
/** What a test reports besides pass/fail, for the credential it leaves. */
export interface TestDetails {
    /** The inputs the test ran with; only their digest is kept. */
    inputs?: unknown;
    executionStatus?: RecipeExecutionStatus;
    validationStatus?: RecipeValidationStatus;
    inputSchemaHash?: string;
    /** The revision and content that were tested; defaults to the asset's current ones. */
    tested?: {
        revision: number;
        contentHash: string;
    };
    inputSets?: NonNullable<TestCredential['inputSets']>;
    plannedSets?: number;
    warnings?: string[];
}
export declare class AutomationAssetStore {
    readonly policy: AutomationAssetPolicy;
    private readonly statePath;
    private state;
    constructor(policy: AutomationAssetPolicy);
    snapshot(): AutomationAssetSnapshot;
    get(id: string): AutomationAsset | undefined;
    recordRecipe(url: string, steps: BrowserRecipeStep[], sessionId: string, ok: boolean, now?: number): AutomationCandidate | undefined;
    summarizeCandidate(id: string): AutomationAsset;
    dismissCandidate(id: string): void;
    saveDraft(input: Partial<AutomationAsset> & Pick<AutomationAsset, 'kind' | 'name'>): AutomationAsset;
    /** Validate the v2 steps and asset-level fields of a draft about to be saved. Throws RecipeValidationError. */
    private checkV2;
    validate(id: string): AutomationAsset;
    /**
     * Copy an asset into a NEW draft that remembers where it came from (`sourceAssetId`, `sourceRevision`).
     * This is how an active asset is repaired: active assets cannot be edited, the copy can, and the source
     * keeps running until the copy is tested and activated (which then archives the source).
     */
    fork(id: string): AutomationAsset;
    /**
     * Change an asset's status. Activation is the guarded one: the request must name the revision the caller
     * looked at (`expectedRevision`), and that revision, as it is now, needs a passed test credential bound to
     * its exact content. A draft that was forked from (or converted from) an active asset replaces it: the
     * source is archived in the same write, so the repaired asset never runs next to the one it fixes.
     */
    setStatus(id: string, status: AutomationAssetStatus, options?: {
        expectedRevision?: number;
    }): AutomationAsset;
    /** Throws {@link ActivationRefusedError} unless `asset` may become active; returns the active asset it replaces, if any. */
    private checkActivation;
    search(query: string, domain?: string, status?: AutomationAssetStatus | 'all', kind?: AutomationAssetKind): AutomationAssetSummary[];
    noteRun(id: string, ok: boolean): void;
    /**
     * Record one runtime test as a credential bound to the content that ran. The asset's own `testStatus`
     * moves only if that content is still the asset's current content: a test that finishes after a newer
     * save leaves a credential for the old revision and changes nothing else.
     */
    noteTestResult(id: string, ok: boolean, url: string, evidenceLevel?: EvidenceLevel, failureReason?: string, details?: TestDetails): void;
    assertTarget(asset: AutomationAsset, url: string): void;
    private requireAsset;
    private prune;
    private read;
    private write;
}
export {};
