/** Bounded, local automation-asset lifecycle and retrieval. */
import { type AnyRecipeStep, type BrowserRecipeStep } from './automation.ts';
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
    revision: number;
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
/** Remove concrete form values and non-semantic output from a successful recipe. */
export declare function normalizeRecipeForCandidate(steps: BrowserRecipeStep[]): BrowserRecipeStep[];
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
    setStatus(id: string, status: AutomationAssetStatus): AutomationAsset;
    search(query: string, domain?: string, status?: AutomationAssetStatus | 'all', kind?: AutomationAssetKind): AutomationAssetSummary[];
    noteRun(id: string, ok: boolean): void;
    noteTestResult(id: string, ok: boolean, url: string, evidenceLevel?: EvidenceLevel, failureReason?: string): void;
    assertTarget(asset: AutomationAsset, url: string): void;
    private requireAsset;
    private prune;
    private read;
    private write;
}
