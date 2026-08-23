/** Bounded, local automation-asset lifecycle and retrieval. */
import type { BrowserRecipeStep } from './automation.ts';
export declare const ASSET_PERSISTENCE_MODES: readonly ["off", "manual", "suggest", "auto-draft"];
export type AssetPersistenceMode = typeof ASSET_PERSISTENCE_MODES[number];
export declare const ASSET_ACTIVATION_MODES: readonly ["manual", "auto-tested"];
export type AssetActivationMode = typeof ASSET_ACTIVATION_MODES[number];
export type AutomationAssetKind = 'recipe' | 'userscript';
export type AutomationAssetStatus = 'draft' | 'active' | 'archived';
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
    recipe?: BrowserRecipeStep[];
    source?: string;
    revision: number;
    testStatus: 'untested' | 'passed' | 'failed';
    testMessage?: string;
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
    test(id: string): AutomationAsset;
    validate(id: string): AutomationAsset;
    setStatus(id: string, status: AutomationAssetStatus): AutomationAsset;
    search(query: string, domain?: string, status?: AutomationAssetStatus | 'all', kind?: AutomationAssetKind): AutomationAssetSummary[];
    noteRun(id: string, ok: boolean): void;
    assertTarget(asset: AutomationAsset, url: string): void;
    private requireAsset;
    private prune;
    private read;
    private write;
}
