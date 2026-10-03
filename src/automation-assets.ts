/** Bounded, local automation-asset lifecycle and retrieval. */

import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { validateRecipeEnums, type AnyRecipeStep, type BrowserRecipeStep, type RecipeExecutionStatus, type RecipeValidationStatus } from './automation.ts'
import { RecipeValidationError } from './actions/errors.ts'
import {
  normalizeInputSchema, normalizeOutputSchema, normalizePostconditions, normalizeRequiredCapabilities, pendingDisambiguation, placeholderNames, validateRecipeV2,
  hostInDomains, type BrowserRecipeStepV2, type InputSpec, type OutputSpec, type PendingDisambiguation, type Postcondition,
} from './automation-v2.ts'
import { validateUserscript } from './scripts.ts'
import { inputSetShortfall } from './activation-rules.ts'

export const ASSET_PERSISTENCE_MODES = ['off', 'manual', 'suggest', 'auto-draft'] as const
export type AssetPersistenceMode = typeof ASSET_PERSISTENCE_MODES[number]
export const ASSET_ACTIVATION_MODES = ['manual', 'auto-tested'] as const
export type AssetActivationMode = typeof ASSET_ACTIVATION_MODES[number]
export type AutomationAssetKind = 'recipe' | 'userscript'
export type AutomationAssetStatus = 'draft' | 'active' | 'archived'
/**
 * How strongly the last passing test confirmed the result. `verified`: a recipe
 * with assert steps ran and every one held. `legacy-unverified`: the steps ran
 * without raising, but nothing checked the outcome (recipes without an assert
 * step, UserScripts, and every asset saved before B2). A missing value on stored
 * data means `legacy-unverified`.
 */
export type EvidenceLevel = 'verified' | 'legacy-unverified'

/** Recipe/UserScript test credentials kept per asset unless `maxTestCredentials` says otherwise. */
export const DEFAULT_TEST_CREDENTIALS = 5

/**
 * What one runtime test proved, bound to the exact content it ran against. Activation trusts
 * only a credential whose revision and contentHash match the asset as it is now.
 * Inputs are kept as a digest, never as values.
 */
export interface TestCredential {
  revision: number
  /** {@link computeContentHash} of the content that was tested. */
  contentHash: string
  /** sha256 of the typed inputSchema (or of the declared input names for v1 and UserScripts). */
  inputSchemaHash: string
  schemaVersion: 1 | 2
  testedAt: string
  /** Truncated sha256 of the canonical inputs the test ran with. */
  inputsDigest: string
  executionStatus: RecipeExecutionStatus
  validationStatus: RecipeValidationStatus
  evidenceLevel: EvidenceLevel
  /** The test counted as passed: it completed, nothing failed, and (v2) something verified the result. */
  passed: boolean
  /** Synthesized when data written before B4 was loaded: `testStatus` was `passed` and nothing else is known. */
  legacy?: true
  /** A test with several input sets (each in a fresh context): one entry per set that ran. Digests only. */
  inputSets?: { index: number; inputsDigest: string; passed: boolean; executionStatus: RecipeExecutionStatus; validationStatus: RecipeValidationStatus; outputsDigest: string }[]
  /** How many sets the test was asked to run (more than `inputSets.length` when a failing set stopped it). */
  plannedSets?: number
  /** Cautions on a passing test, e.g. `PARAMETERIZATION_SUSPECT`: different inputs gave identical outputs. */
  warnings?: string[]
}

export interface AutomationAssetPolicyInput {
  enabled?: boolean
  directory?: string
  persistenceMode?: AssetPersistenceMode
  activationMode?: AssetActivationMode
  minSuccessfulRuns?: number
  minDistinctSessions?: number
  successWindowDays?: number
  minSuccessRate?: number
  maxCandidates?: number
  candidateTtlDays?: number
  maxSuggestionsPerDay?: number
  maxDrafts?: number
  maxActiveAssets?: number
  retrievalTopK?: number
  catalogTokenBudget?: number
  modelDevelopmentEnabled?: boolean
  maxModelDraftWritesPerSession?: number
  /** How many test credentials each asset keeps (the most recent ones). Default 5. */
  maxTestCredentials?: number
  /**
   * How many input sets the passing test of an asset that declares inputs must have covered before it can be activated
   * (1 to 5, default 2). Assets without inputs are not affected.
   */
  minInputSetsForActivation?: number
}

export interface AutomationAssetPolicy {
  enabled: boolean
  directory: string
  persistenceMode: AssetPersistenceMode
  activationMode: AssetActivationMode
  minSuccessfulRuns: number
  minDistinctSessions: number
  successWindowDays: number
  minSuccessRate: number
  maxCandidates: number
  candidateTtlDays: number
  maxSuggestionsPerDay: number
  maxDrafts: number
  maxActiveAssets: number
  retrievalTopK: number
  catalogTokenBudget: number
  modelDevelopmentEnabled: boolean
  maxModelDraftWritesPerSession: number
  maxTestCredentials: number
  minInputSetsForActivation: number
}

export interface AutomationCandidate {
  id: string
  fingerprint: string
  domain: string
  title: string
  steps: BrowserRecipeStep[]
  successfulRuns: number
  failedRuns: number
  sessionIds: string[]
  firstSeenAt: string
  lastSeenAt: string
  suggestedAt?: string
  dismissedAt?: string
}

export interface AutomationAsset {
  id: string
  kind: AutomationAssetKind
  status: AutomationAssetStatus
  name: string
  description: string
  domains: string[]
  tags: string[]
  inputNames: string[]
  /** v1 steps (`selector`, first match) or, when `schemaVersion` is 2, {@link BrowserRecipeStepV2}. */
  recipe?: AnyRecipeStep[]
  source?: string
  /** Recipe schema. Absent means 1: `.first()` locating and the v1 fill rule, unchanged. */
  schemaVersion?: 1 | 2
  /** v2: typed inputs. When present they are validated and converted at run time. */
  inputSchema?: InputSpec[]
  /** v2: named, typed outputs of `extract` steps with `as`. */
  outputSchema?: OutputSpec[]
  /** v2: conditions that must hold after the steps for the result to count as verified. */
  postconditions?: Postcondition[]
  /** v2: recorded only; not enforced yet. */
  requiredCapabilities?: string[]
  /** v2 converted from v1: steps that still take the first match and should be made unique. Derived from the recipe on save. */
  pendingDisambiguation?: PendingDisambiguation[]
  /** Set when this draft was converted from another asset; the source is never modified. */
  sourceAssetId?: string
  sourceRevision?: number
  /**
   * Set on a draft built from an exploration journal (`draft_from_journal`). `unmapped` counts the journaled
   * actions that could not become steps; while it is above zero the draft is a half-finished copy of the
   * exploration and cannot be activated. Saving the draft again with an explicit recipe replaces it and drops this.
   */
  origin?: { kind: 'journal'; fromSeq: number; toSeq: number; unmapped: number }
  /** Bumped by every save, never reused. */
  revision: number
  /** sha256 over the recipe or source, schemaVersion, inputSchema, outputSchema, postconditions and domains. Derived; recomputed on load. */
  contentHash?: string
  /** The most recent runtime tests, oldest first. Activation checks the one bound to the current revision. */
  testCredentials?: TestCredential[]
  testStatus: 'untested' | 'passed' | 'failed'
  testMessage?: string
  /** Optional on stored data; absent means `legacy-unverified`. Set only by a passing runtime test. */
  evidenceLevel?: EvidenceLevel
  successCount: number
  failureCount: number
  createdAt: string
  updatedAt: string
  lastRunAt?: string
}

export interface AutomationAssetSummary {
  id: string
  kind: AutomationAssetKind
  status: AutomationAssetStatus
  name: string
  description: string
  domains: string[]
  tags: string[]
  inputNames: string[]
  /** Only present for schema v2 assets. */
  schemaVersion?: 2
  /** v2 assets: the typed inputs a caller must pass to automation.run. */
  inputSchema?: InputSpec[]
  revision: number
  testStatus: AutomationAsset['testStatus']
  successCount: number
  failureCount: number
  updatedAt: string
  lastRunAt?: string
}

export interface AutomationCandidateSummary {
  id: string
  domain: string
  title: string
  successfulRuns: number
  failedRuns: number
  distinctSessions: number
  firstSeenAt: string
  lastSeenAt: string
  suggestedAt?: string
  dismissedAt?: string
}

export interface AutomationAssetSnapshot {
  policy: Omit<AutomationAssetPolicy, 'directory'>
  candidates: AutomationCandidateSummary[]
  assets: AutomationAssetSummary[]
}

interface PersistedState {
  version: 1
  candidates: AutomationCandidate[]
  assets: AutomationAsset[]
}

const DEFAULT_STATE: PersistedState = { version: 1, candidates: [], assets: [] }

function boundedInteger(value: unknown, fallback: number, min: number, max: number): number {
  return typeof value === 'number' && Number.isInteger(value) ? Math.min(Math.max(value, min), max) : fallback
}

function boundedNumber(value: unknown, fallback: number, min: number, max: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.min(Math.max(value, min), max) : fallback
}

export function defaultAutomationAssetDirectory(): string {
  const home = process.env.DSH_HOME ?? path.join(os.homedir(), '.dsh')
  return path.join(home, 'data', 'browser', 'automations')
}

export function resolveAutomationAssetPolicy(input: AutomationAssetPolicyInput = {}): AutomationAssetPolicy {
  const persistenceMode = input.persistenceMode ?? 'suggest'
  const activationMode = input.activationMode ?? 'manual'
  if (!ASSET_PERSISTENCE_MODES.includes(persistenceMode)) throw new Error('automationAssets.persistenceMode is invalid')
  if (!ASSET_ACTIVATION_MODES.includes(activationMode)) throw new Error('automationAssets.activationMode is invalid')
  return {
    enabled: input.enabled ?? true,
    directory: input.directory?.trim() || defaultAutomationAssetDirectory(),
    persistenceMode,
    activationMode,
    minSuccessfulRuns: boundedInteger(input.minSuccessfulRuns, 3, 2, 20),
    minDistinctSessions: boundedInteger(input.minDistinctSessions, 2, 1, 10),
    successWindowDays: boundedInteger(input.successWindowDays, 14, 1, 90),
    minSuccessRate: boundedNumber(input.minSuccessRate, 0.8, 0.5, 1),
    maxCandidates: boundedInteger(input.maxCandidates, 20, 1, 100),
    candidateTtlDays: boundedInteger(input.candidateTtlDays, 14, 1, 90),
    maxSuggestionsPerDay: boundedInteger(input.maxSuggestionsPerDay, 2, 0, 20),
    maxDrafts: boundedInteger(input.maxDrafts, 10, 1, 100),
    maxActiveAssets: boundedInteger(input.maxActiveAssets, 50, 1, 200),
    retrievalTopK: boundedInteger(input.retrievalTopK, 5, 1, 20),
    catalogTokenBudget: boundedInteger(input.catalogTokenBudget, 800, 100, 4_000),
    modelDevelopmentEnabled: input.modelDevelopmentEnabled ?? true,
    maxModelDraftWritesPerSession: boundedInteger(input.maxModelDraftWritesPerSession, 3, 1, 20),
    maxTestCredentials: boundedInteger(input.maxTestCredentials, DEFAULT_TEST_CREDENTIALS, 1, 20),
    minInputSetsForActivation: boundedInteger(input.minInputSetsForActivation, 2, 1, 5),
  }
}

function nowIso(now = Date.now()): string { return new Date(now).toISOString() }
function uid(): string { return crypto.randomUUID() }
function hash(value: string): string { return crypto.createHash('sha256').update(value).digest('hex') }

/** JSON with sorted keys and no undefined members: the same value always gives the same text. */
function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(entry => canonicalJson(entry)).join(',') + ']'
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    return '{' + Object.keys(record).filter(key => record[key] !== undefined).sort().map(key => JSON.stringify(key) + ':' + canonicalJson(record[key])).join(',') + '}'
  }
  return JSON.stringify(value) ?? 'null'
}

type HashedContent = Pick<AutomationAsset, 'kind' | 'recipe' | 'source' | 'schemaVersion' | 'inputSchema' | 'outputSchema' | 'postconditions' | 'domains'>

/**
 * What a test vouches for: the steps or source, the schema version and the three v2 contracts, and the
 * domains it may run on. Name, description, tags and counters are not content. Domains are a set.
 */
export function computeContentHash(asset: HashedContent): string {
  return hash(canonicalJson({
    ...asset.kind === 'userscript' ? { source: asset.source ?? '' } : { recipe: asset.recipe ?? [] },
    schemaVersion: asset.schemaVersion ?? 1,
    inputSchema: asset.inputSchema ?? null,
    outputSchema: asset.outputSchema ?? null,
    postconditions: asset.postconditions ?? null,
    domains: [...asset.domains].sort(),
  }))
}

function computeInputSchemaHash(asset: Pick<AutomationAsset, 'inputSchema' | 'inputNames'>): string {
  return hash(canonicalJson(asset.inputSchema ?? { inputNames: [...asset.inputNames].sort() }))
}

/** A digest of the inputs a test ran with. The values themselves are never stored. */
export function digestInputs(inputs: unknown): string {
  return hash(canonicalJson(inputs ?? {})).slice(0, 16)
}

/** Why an activation request was refused; the message says what to do. */
export type ActivationRefusal = 'expected-revision-required' | 'revision-mismatch' | 'not-tested' | 'test-failed' | 'content-changed' | 'no-domain' | 'limit-reached' | 'incomplete-draft' | 'insufficient-input-sets'

export class ActivationRefusedError extends Error {
  constructor(readonly reason: ActivationRefusal, message: string) {
    super(message)
    this.name = 'ActivationRefusedError'
  }
}

function safeDomain(url: string): string {
  const parsed = new URL(url)
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('automation assets only support HTTP(S) URLs')
  return parsed.hostname.toLowerCase()
}

function cap(value: string, max: number): string { return value.trim().slice(0, max) }

const SECRET_SELECTOR = /pass(word)?|token|secret|otp|one[-_ ]?time|credit|card|cvv|authorization/i

function sanitizeSelector(selector: string): string {
  return selector.replace(/\[\s*([-\w:]+)\s*[*^$|~]?=\s*(?:"[^"]*"|'[^']*'|[^\]]+)\]/g, '[$1]').slice(0, 500)
}

function inputPlaceholder(selector: string, secret: boolean): string {
  if (secret) return 'secret'
  const hint = selector.match(/\[\s*name\s*=\s*["']?([^\]"']+)/i)?.[1]
    ?? selector.match(/#([\w-]+)/)?.[1]
    ?? selector.match(/\[\s*aria-label\s*=\s*["']?([^\]"']+)/i)?.[1]
  const suffix = hint?.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 24)
  return suffix ? `input_${suffix}` : 'input'
}

function recipeInputNames(steps: BrowserRecipeStep[]): string[] {
  return [...new Set(JSON.stringify(steps).match(/\{\{([a-zA-Z][\w-]*)\}\}/g)?.map(value => value.slice(2, -2)) ?? [])]
}

/** Remove concrete form values and non-semantic output from a successful recipe. */
export function normalizeRecipeForCandidate(steps: BrowserRecipeStep[]): BrowserRecipeStep[] {
  if (!Array.isArray(steps) || steps.length < 1 || steps.length > 25) throw new Error('candidate recipe requires 1 to 25 steps')
  const normalized = steps.map((step) => {
    const clean = structuredClone(step) as BrowserRecipeStep
    delete (clean as Record<string, unknown>).text
    if ('value' in clean) {
      const selector = 'selector' in clean ? String(clean.selector ?? '') : ''
      const secret = SECRET_SELECTOR.test(selector)
      ;(clean as Record<string, unknown>).value = `{{${inputPlaceholder(selector, secret)}}}`
    }
    if ('selector' in clean && typeof clean.selector === 'string') clean.selector = sanitizeSelector(clean.selector)
    if ('timeoutMs' in clean && typeof clean.timeoutMs === 'number') clean.timeoutMs = Math.min(Math.max(Math.round(clean.timeoutMs), 100), 60_000)
    if ('waitMs' in clean && typeof clean.waitMs === 'number') clean.waitMs = Math.min(Math.max(Math.round(clean.waitMs), 0), 10_000)
    return clean
  })
  if (recipeInputNames(normalized).length > 20) throw new Error('candidate recipe exceeds 20 reusable inputs')
  return normalized
}

function candidateFingerprint(domain: string, steps: BrowserRecipeStep[]): string {
  return hash(JSON.stringify({ domain, steps }))
}

function summary(asset: AutomationAsset): AutomationAssetSummary {
  const { id, kind, status, name, description, domains, tags, inputNames, revision, testStatus, successCount, failureCount, updatedAt, lastRunAt } = asset
  return { id, kind, status, name, description, domains: [...domains], tags: [...tags], inputNames: [...inputNames], ...asset.schemaVersion === 2 ? { schemaVersion: 2 as const, ...asset.inputSchema ? { inputSchema: structuredClone(asset.inputSchema) } : {} } : {}, revision, testStatus, successCount, failureCount, updatedAt, ...lastRunAt ? { lastRunAt } : {} }
}

function persistedState(value: unknown): PersistedState {
  if (!value || typeof value !== 'object') throw new Error('state root must be an object')
  const state = value as Partial<PersistedState>
  if (state.version !== 1 || !Array.isArray(state.candidates) || !Array.isArray(state.assets)) throw new Error('unsupported or malformed state')
  if (state.candidates.length > 200 || state.assets.length > 300) throw new Error('state exceeds hard item limits')
  const malformedCandidate = state.candidates.some(candidate => !candidate || typeof candidate !== 'object'
    || typeof candidate.id !== 'string' || typeof candidate.fingerprint !== 'string' || typeof candidate.domain !== 'string'
    || !Array.isArray(candidate.steps) || candidate.steps.length < 1 || candidate.steps.length > 25
    || !Array.isArray(candidate.sessionIds) || candidate.sessionIds.length > 30
    || typeof candidate.successfulRuns !== 'number' || typeof candidate.failedRuns !== 'number'
    || !Number.isFinite(Date.parse(candidate.firstSeenAt)) || !Number.isFinite(Date.parse(candidate.lastSeenAt)))
  const malformedAsset = state.assets.some(asset => !asset || typeof asset !== 'object'
    || typeof asset.id !== 'string' || !['recipe', 'userscript'].includes(asset.kind) || !['draft', 'active', 'archived'].includes(asset.status)
    || typeof asset.name !== 'string' || asset.name.length > 120 || !Array.isArray(asset.domains) || asset.domains.length > 20
    || !Array.isArray(asset.tags) || asset.tags.length > 20 || !Array.isArray(asset.inputNames) || asset.inputNames.length > 20
    || (asset.kind === 'recipe' && (!Array.isArray(asset.recipe) || asset.recipe.length < 1 || asset.recipe.length > 25))
    || (asset.kind === 'userscript' && (typeof asset.source !== 'string' || Buffer.byteLength(asset.source, 'utf8') > 64 * 1024))
    || (asset.schemaVersion !== undefined && ![1, 2].includes(asset.schemaVersion))
    || !Number.isInteger(asset.revision) || !Number.isFinite(Date.parse(asset.createdAt)) || !Number.isFinite(Date.parse(asset.updatedAt)))
  if (malformedCandidate || malformedAsset) throw new Error('persisted asset entries are malformed')
  const malformedCredentials = state.assets.some(asset => asset.testCredentials !== undefined
    && (!Array.isArray(asset.testCredentials) || asset.testCredentials.some(entry => !entry || typeof entry !== 'object' || !Number.isInteger(entry.revision) || typeof entry.contentHash !== 'string')))
  if (malformedCredentials) throw new Error('persisted test credentials are malformed')
  for (const asset of state.assets) upgradeLegacyAsset(asset)
  return { version: 1, candidates: state.candidates, assets: state.assets }
}

/**
 * Fill in what data written before B4 lacks, without touching any existing field: the content hash is
 * derived, and a `testStatus` of `passed` becomes a legacy credential bound to the current revision.
 */
function upgradeLegacyAsset(asset: AutomationAsset): void {
  asset.contentHash = computeContentHash(asset)
  if (asset.testStatus === 'passed' && !asset.testCredentials?.some(entry => entry.revision === asset.revision)) {
    const legacy: TestCredential = {
      revision: asset.revision, contentHash: asset.contentHash, inputSchemaHash: computeInputSchemaHash(asset), schemaVersion: asset.schemaVersion ?? 1,
      testedAt: asset.updatedAt, inputsDigest: 'legacy', executionStatus: 'completed',
      validationStatus: asset.evidenceLevel === 'verified' ? 'passed' : 'not_checked', evidenceLevel: asset.evidenceLevel ?? 'legacy-unverified', passed: true, legacy: true,
    }
    asset.testCredentials = [...asset.testCredentials ?? [], legacy]
  }
}

/** What a test reports besides pass/fail, for the credential it leaves. */
export interface TestDetails {
  /** The inputs the test ran with; only their digest is kept. */
  inputs?: unknown
  executionStatus?: RecipeExecutionStatus
  validationStatus?: RecipeValidationStatus
  inputSchemaHash?: string
  /** The revision and content that were tested; defaults to the asset's current ones. */
  tested?: { revision: number; contentHash: string }
  inputSets?: NonNullable<TestCredential['inputSets']>
  plannedSets?: number
  warnings?: string[]
}

export class AutomationAssetStore {
  private readonly statePath: string
  private state: PersistedState

  constructor(readonly policy: AutomationAssetPolicy) {
    this.statePath = path.join(policy.directory, 'assets.json')
    this.state = this.read()
    this.prune()
  }

  snapshot(): AutomationAssetSnapshot {
    const { directory: _directory, ...publicPolicy } = this.policy
    return {
      policy: publicPolicy,
      candidates: this.state.candidates.map(({ id, domain, title, successfulRuns, failedRuns, sessionIds, firstSeenAt, lastSeenAt, suggestedAt, dismissedAt }) => ({
        id, domain, title, successfulRuns, failedRuns, distinctSessions: sessionIds.length, firstSeenAt, lastSeenAt,
        ...suggestedAt ? { suggestedAt } : {}, ...dismissedAt ? { dismissedAt } : {},
      })),
      assets: this.state.assets.map(summary),
    }
  }

  get(id: string): AutomationAsset | undefined {
    const asset = this.state.assets.find(item => item.id === id)
    return asset ? structuredClone(asset) : undefined
  }

  recordRecipe(url: string, steps: BrowserRecipeStep[], sessionId: string, ok: boolean, now = Date.now()): AutomationCandidate | undefined {
    if (!this.policy.enabled || !['suggest', 'auto-draft'].includes(this.policy.persistenceMode)) return undefined
    const domain = safeDomain(url)
    const normalized = normalizeRecipeForCandidate(steps)
    const fingerprint = candidateFingerprint(domain, normalized)
    const timestamp = nowIso(now)
    let candidate = this.state.candidates.find(item => item.fingerprint === fingerprint)
    if (!candidate) {
      candidate = { id: uid(), fingerprint, domain, title: `Reusable automation for ${domain}`, steps: normalized, successfulRuns: 0, failedRuns: 0, sessionIds: [], firstSeenAt: timestamp, lastSeenAt: timestamp }
      this.state.candidates.push(candidate)
    }
    const windowStart = now - this.policy.successWindowDays * 86_400_000
    if (Date.parse(candidate.firstSeenAt) < windowStart) {
      candidate.successfulRuns = 0
      candidate.failedRuns = 0
      candidate.sessionIds = []
      candidate.firstSeenAt = timestamp
      candidate.suggestedAt = undefined
    }
    if (ok) candidate.successfulRuns += 1
    else candidate.failedRuns += 1
    candidate.lastSeenAt = timestamp
    const sessionKey = sessionId ? hash(sessionId).slice(0, 16) : ''
    if (sessionKey && !candidate.sessionIds.includes(sessionKey)) candidate.sessionIds.push(sessionKey)
    candidate.sessionIds = candidate.sessionIds.slice(-this.policy.minDistinctSessions * 3)
    const total = candidate.successfulRuns + candidate.failedRuns
    const eligible = candidate.successfulRuns >= this.policy.minSuccessfulRuns
      && candidate.sessionIds.length >= this.policy.minDistinctSessions
      && candidate.successfulRuns / total >= this.policy.minSuccessRate
    const day = timestamp.slice(0, 10)
    const suggestionsToday = this.state.candidates.filter(item => item.suggestedAt?.startsWith(day)).length
    if (eligible && !candidate.suggestedAt && !candidate.dismissedAt && suggestionsToday < this.policy.maxSuggestionsPerDay) candidate.suggestedAt = timestamp
    this.prune(now)
    this.write()
    if (this.policy.persistenceMode === 'auto-draft' && candidate.suggestedAt && !this.state.assets.some(item => item.tags.includes(`candidate:${candidate!.id}`))) {
      this.summarizeCandidate(candidate.id)
    }
    return structuredClone(candidate)
  }

  summarizeCandidate(id: string): AutomationAsset {
    const candidate = this.state.candidates.find(item => item.id === id)
    if (!candidate) throw new Error('automation candidate not found')
    if (this.state.assets.filter(item => item.status === 'draft').length >= this.policy.maxDrafts) throw new Error('automation draft limit reached')
    const timestamp = nowIso()
    const asset: AutomationAsset = {
      id: uid(), kind: 'recipe', status: 'draft', name: candidate.title, description: `Captured from ${candidate.successfulRuns} successful runs across ${candidate.sessionIds.length} sessions.`,
      domains: [candidate.domain], tags: [`candidate:${candidate.id}`], inputNames: recipeInputNames(candidate.steps), recipe: structuredClone(candidate.steps), revision: 1,
      testStatus: 'untested', successCount: 0, failureCount: 0, createdAt: timestamp, updatedAt: timestamp,
    }
    asset.contentHash = computeContentHash(asset)
    this.state.assets.push(asset)
    candidate.dismissedAt = timestamp
    this.write()
    return structuredClone(asset)
  }

  dismissCandidate(id: string): void {
    const candidate = this.state.candidates.find(item => item.id === id)
    if (!candidate) throw new Error('automation candidate not found')
    candidate.dismissedAt = nowIso()
    this.write()
  }

  saveDraft(input: Partial<AutomationAsset> & Pick<AutomationAsset, 'kind' | 'name'>): AutomationAsset {
    if (!this.policy.enabled || this.policy.persistenceMode === 'off') throw new Error('automation asset persistence is disabled')
    const existing = input.id ? this.state.assets.find(item => item.id === input.id) : undefined
    if (existing?.status === 'active') throw new Error('active assets must be copied to a draft before editing')
    if (!existing && this.state.assets.filter(item => item.status === 'draft').length >= this.policy.maxDrafts) throw new Error('automation draft limit reached')
    const timestamp = nowIso()
    const name = cap(input.name, 120)
    if (!name) throw new Error('automation asset name is required')
    const kind = input.kind
    const schemaVersion = input.schemaVersion ?? existing?.schemaVersion ?? 1
    if (schemaVersion !== 1 && schemaVersion !== 2) throw new RecipeValidationError('schemaVersion must be 1 or 2')
    const domains = [...new Set((input.domains ?? []).map(value => cap(String(value).toLowerCase(), 255)).filter(Boolean))].slice(0, 20)
    const tags = [...new Set((input.tags ?? []).map(value => cap(String(value), 40)).filter(Boolean))].slice(0, 20)
    const declaredInputNames = [...new Set((input.inputNames ?? []).map(value => cap(String(value), 40)).filter(value => /^[a-zA-Z][\w-]*$/.test(value)))].slice(0, 20)
    if (kind === 'recipe' && (!Array.isArray(input.recipe) || input.recipe.length < 1 || input.recipe.length > 25)) throw new Error('recipe asset requires 1 to 25 steps')
    const hasV2Fields = [input.inputSchema, input.outputSchema, input.postconditions, input.requiredCapabilities].some(value => value !== undefined)
    if (kind === 'userscript' && (schemaVersion === 2 || hasV2Fields)) throw new RecipeValidationError('schemaVersion 2 and inputSchema/outputSchema/postconditions/requiredCapabilities apply to recipe assets only')
    if (kind === 'recipe' && schemaVersion === 1 && hasV2Fields) throw new RecipeValidationError('inputSchema, outputSchema, postconditions and requiredCapabilities need schemaVersion 2')
    // Unknown extract modes and wait conditions never reach storage; assets already stored are not re-checked.
    if (kind === 'recipe' && schemaVersion === 1) validateRecipeEnums(input.recipe as BrowserRecipeStep[])
    const v2 = kind === 'recipe' && schemaVersion === 2 ? this.checkV2(input, domains) : undefined
    if (kind === 'userscript') {
      const validation = validateUserscript(String(input.source ?? ''))
      if (!validation.valid) throw new Error('userscript is invalid: ' + validation.errors.join('; '))
    }
    const inputNames = v2 ? v2.inputNames : kind === 'recipe' ? recipeInputNames(input.recipe as BrowserRecipeStep[]) : declaredInputNames
    const sourceAssetId = input.sourceAssetId ?? existing?.sourceAssetId
    const sourceRevision = input.sourceRevision ?? existing?.sourceRevision
    if (sourceAssetId !== undefined && (typeof sourceAssetId !== 'string' || sourceAssetId.length > 80 || !Number.isInteger(sourceRevision))) throw new RecipeValidationError('sourceAssetId needs a string id and an integer sourceRevision')
    const asset: AutomationAsset = {
      id: existing?.id ?? uid(), kind, status: 'draft', name, description: cap(String(input.description ?? ''), 500), domains, tags, inputNames,
      ...kind === 'recipe' ? { recipe: structuredClone(input.recipe!) } : { source: String(input.source) },
      ...v2 ? {
        schemaVersion: 2 as const,
        ...v2.inputSchema ? { inputSchema: v2.inputSchema } : {},
        ...v2.outputSchema ? { outputSchema: v2.outputSchema } : {},
        ...v2.postconditions ? { postconditions: v2.postconditions } : {},
        ...v2.requiredCapabilities ? { requiredCapabilities: v2.requiredCapabilities } : {},
        ...v2.pending.length ? { pendingDisambiguation: v2.pending } : {},
      } : {},
      ...sourceAssetId !== undefined ? { sourceAssetId, sourceRevision: sourceRevision! } : {},
      ...input.origin ? { origin: structuredClone(input.origin) } : {},
      revision: (existing?.revision ?? 0) + 1, testStatus: 'untested', successCount: existing?.successCount ?? 0, failureCount: existing?.failureCount ?? 0,
      // Earlier credentials stay as history; each is bound to its own revision and never vouches for this one.
      ...existing?.testCredentials?.length ? { testCredentials: existing.testCredentials.slice(-this.policy.maxTestCredentials) } : {},
      createdAt: existing?.createdAt ?? timestamp, updatedAt: timestamp, ...existing?.lastRunAt ? { lastRunAt: existing.lastRunAt } : {},
    }
    asset.contentHash = computeContentHash(asset)
    if (existing) this.state.assets[this.state.assets.indexOf(existing)] = asset
    else this.state.assets.push(asset)
    this.write()
    return structuredClone(asset)
  }

  /** Validate the v2 steps and asset-level fields of a draft about to be saved. Throws RecipeValidationError. */
  private checkV2(input: Partial<AutomationAsset>, domains: readonly string[]): {
    inputNames: string[]; inputSchema?: InputSpec[]; outputSchema?: OutputSpec[]; postconditions?: Postcondition[]; requiredCapabilities?: string[]; pending: PendingDisambiguation[]
  } {
    try {
      const steps = input.recipe as BrowserRecipeStepV2[]
      validateRecipeV2(steps)
      const gotos = steps.filter(step => step.type === 'goto')
      if (gotos.length && domains.length === 0) throw new Error('a recipe with goto steps must declare domains: goto may only go to the asset\'s domains')
      for (const step of gotos) {
        if (/\{\{/.test(step.url!)) continue // a placeholder host is checked when the recipe runs
        const host = new URL(step.url!).hostname
        if (!hostInDomains(host, domains)) throw new Error(`goto ${host} is not allowed on this asset: it is outside its domains (${domains.join(', ')})`)
      }
      const inputSchema = input.inputSchema !== undefined ? normalizeInputSchema(input.inputSchema) : undefined
      const outputSchema = input.outputSchema !== undefined ? normalizeOutputSchema(input.outputSchema, steps) : undefined
      const postconditions = input.postconditions !== undefined ? normalizePostconditions(input.postconditions, steps) : undefined
      const requiredCapabilities = input.requiredCapabilities !== undefined ? normalizeRequiredCapabilities(input.requiredCapabilities) : undefined
      const used = placeholderNames(steps, postconditions ?? [])
      if (inputSchema) {
        const declared = new Set(inputSchema.map(spec => spec.name))
        const undeclared = used.filter(name => !declared.has(name))
        if (undeclared.length) throw new Error(`the recipe uses {{${undeclared.join('}}, {{')}}} but inputSchema does not declare it`)
      } else if (used.length > 20) throw new Error('recipe exceeds 20 reusable inputs')
      return {
        inputNames: inputSchema ? inputSchema.map(spec => spec.name) : used.slice(0, 20),
        ...inputSchema ? { inputSchema } : {}, ...outputSchema ? { outputSchema } : {}, ...postconditions ? { postconditions } : {},
        ...requiredCapabilities ? { requiredCapabilities } : {},
        pending: pendingDisambiguation(steps),
      }
    } catch (error) {
      throw error instanceof RecipeValidationError ? error : new RecipeValidationError(error instanceof Error ? error.message : String(error))
    }
  }

  validate(id: string): AutomationAsset {
    const asset = this.requireAsset(id)
    let message = 'Recipe structure is valid; runtime replay is still required.'
    if (asset.kind === 'recipe' && asset.schemaVersion === 2) {
      this.checkV2(asset, asset.domains)
      const hasAssert = (asset.recipe as BrowserRecipeStepV2[]).some(step => step.type === 'assert')
      const notes: string[] = []
      if (asset.pendingDisambiguation?.length) notes.push(`${asset.pendingDisambiguation.length} step(s) still take the first match (explicitFirst): make their locators unique`)
      if (!hasAssert && !asset.postconditions?.length) notes.push('no assert step or postcondition: a test cannot pass until one checks the result')
      message = 'Recipe v2 structure is valid; runtime replay is still required.' + (notes.length ? ' ' + notes.join('; ') + '.' : '')
    } else if (asset.kind === 'recipe') normalizeRecipeForCandidate((asset.recipe ?? []) as BrowserRecipeStep[])
    else {
      const validation = validateUserscript(asset.source ?? '')
      if (!validation.valid) throw new Error(validation.errors.join('; '))
      message = `Userscript validated (${validation.sha256.slice(0, 12)}); runtime replay is still required.`
    }
    return { ...structuredClone(asset), testMessage: message }
  }

  /**
   * Copy an asset into a NEW draft that remembers where it came from (`sourceAssetId`, `sourceRevision`).
   * This is how an active asset is repaired: active assets cannot be edited, the copy can, and the source
   * keeps running until the copy is tested and activated (which then archives the source).
   */
  fork(id: string): AutomationAsset {
    if (!this.policy.enabled || this.policy.persistenceMode === 'off') throw new Error('automation asset persistence is disabled')
    const source = this.requireAsset(id)
    if (this.state.assets.filter(item => item.status === 'draft').length >= this.policy.maxDrafts) throw new Error('automation draft limit reached')
    const timestamp = nowIso()
    const copy = structuredClone(source)
    const draft: AutomationAsset = {
      id: uid(), kind: copy.kind, status: 'draft', name: copy.name, description: copy.description, domains: copy.domains, tags: copy.tags, inputNames: copy.inputNames,
      ...copy.recipe ? { recipe: copy.recipe } : {}, ...copy.source !== undefined ? { source: copy.source } : {},
      ...copy.schemaVersion ? { schemaVersion: copy.schemaVersion } : {},
      ...copy.inputSchema ? { inputSchema: copy.inputSchema } : {}, ...copy.outputSchema ? { outputSchema: copy.outputSchema } : {},
      ...copy.postconditions ? { postconditions: copy.postconditions } : {}, ...copy.requiredCapabilities ? { requiredCapabilities: copy.requiredCapabilities } : {},
      ...copy.pendingDisambiguation ? { pendingDisambiguation: copy.pendingDisambiguation } : {},
      sourceAssetId: source.id, sourceRevision: source.revision,
      revision: 1, testStatus: 'untested', successCount: 0, failureCount: 0, createdAt: timestamp, updatedAt: timestamp,
    }
    draft.contentHash = computeContentHash(draft)
    this.state.assets.push(draft)
    this.write()
    return structuredClone(draft)
  }

  /**
   * Change an asset's status. Activation is the guarded one: the request must name the revision the caller
   * looked at (`expectedRevision`), and that revision, as it is now, needs a passed test credential bound to
   * its exact content. A draft that was forked from (or converted from) an active asset replaces it: the
   * source is archived in the same write, so the repaired asset never runs next to the one it fixes.
   */
  setStatus(id: string, status: AutomationAssetStatus, options: { expectedRevision?: number } = {}): AutomationAsset {
    const asset = this.requireAsset(id)
    if (!['draft', 'active', 'archived'].includes(status)) throw new Error('invalid automation asset status')
    let replaced: AutomationAsset | undefined
    if (status === 'active') {
      replaced = this.checkActivation(asset, options.expectedRevision)
    }
    const timestamp = nowIso()
    asset.status = status
    asset.updatedAt = timestamp
    if (replaced) { replaced.status = 'archived'; replaced.updatedAt = timestamp }
    this.write()
    return structuredClone(asset)
  }

  /** Throws {@link ActivationRefusedError} unless `asset` may become active; returns the active asset it replaces, if any. */
  private checkActivation(asset: AutomationAsset, expectedRevision: number | undefined): AutomationAsset | undefined {
    if (!Number.isInteger(expectedRevision)) throw new ActivationRefusedError('expected-revision-required', 'activation requires expectedRevision: the revision you looked at and tested')
    if (asset.revision !== expectedRevision) {
      throw new ActivationRefusedError('revision-mismatch', `activation refused: expectedRevision ${expectedRevision} is not the current revision ${asset.revision}; the asset changed after you looked at it. Reload it, test that revision, then activate it`)
    }
    const credentials = (asset.testCredentials ?? []).filter(entry => entry.revision === asset.revision)
    const latest = credentials.at(-1)
    if (!latest) throw new ActivationRefusedError('not-tested', `automation asset must pass testing before activation: revision ${asset.revision} has no test credential`)
    if (!latest.passed || asset.testStatus !== 'passed') throw new ActivationRefusedError('test-failed', `automation asset must pass testing before activation: the latest test of revision ${asset.revision} did not pass`)
    if (latest.contentHash !== computeContentHash(asset)) {
      throw new ActivationRefusedError('content-changed', `automation asset must pass testing before activation: the passed test of revision ${asset.revision} covered different content than the asset has now; save and test it again`)
    }
    const shortfall = inputSetShortfall(asset, latest, this.policy.minInputSetsForActivation)
    if (shortfall) {
      throw new ActivationRefusedError('insufficient-input-sets', `automation asset declares ${shortfall.declared} input(s), so its passing test must cover at least ${shortfall.required} different input sets (automationAssets.minInputSetsForActivation), but the test of revision ${asset.revision} covered ${shortfall.covered}. A recipe written against one input can hard-code it. Test again with ${shortfall.required} to 5 different input objects (automation.develop test with inputSets, or a JSON array in the panel's test inputs)`)
    }
    if (asset.origin?.unmapped) throw new ActivationRefusedError('incomplete-draft', `automation draft is incomplete: ${asset.origin.unmapped} action(s) of the exploration it was built from (journal seq ${asset.origin.fromSeq}-${asset.origin.toSeq}) could not become steps. Finish the recipe yourself and save it, test it, then activate`)
    if (asset.domains.length < 1) throw new ActivationRefusedError('no-domain', 'automation asset must declare at least one domain before activation')
    const replaced = asset.sourceAssetId ? this.state.assets.find(item => item.id === asset.sourceAssetId && item.id !== asset.id && item.status === 'active') : undefined
    if (this.state.assets.filter(item => item.status === 'active' && item.id !== asset.id && item.id !== replaced?.id).length >= this.policy.maxActiveAssets) {
      throw new ActivationRefusedError('limit-reached', 'active automation asset limit reached')
    }
    return replaced
  }

  search(query: string, domain?: string, status: AutomationAssetStatus | 'all' = 'active', kind?: AutomationAssetKind): AutomationAssetSummary[] {
    if (!query.trim()) throw new Error('automation search requires explicit keywords')
    if (!['draft', 'active', 'archived', 'all'].includes(status)) throw new Error('invalid automation search status')
    const terms = `${query} ${domain ?? ''}`.slice(0, 2_000).toLowerCase().split(/[^\p{L}\p{N}_.-]+/u).filter(Boolean).slice(0, 20)
    const normalizedDomain = domain?.toLowerCase()
    const scored = this.state.assets.filter(item => (status === 'all' || item.status === status) && (!kind || item.kind === kind)).map(asset => {
      const haystack = [asset.name, asset.description, ...asset.domains, ...asset.tags, ...asset.inputNames].join(' ').toLowerCase()
      let score = terms.reduce((sum, term) => sum + (haystack.includes(term) ? 4 : 0), 0)
      score += terms.reduce((sum, term) => sum + (asset.tags.some(tag => tag.toLowerCase() === term) ? 6 : 0), 0)
      if (normalizedDomain && asset.domains.some(value => normalizedDomain === value || normalizedDomain.endsWith('.' + value))) score += 12
      score += Math.min(asset.successCount, 10) - Math.min(asset.failureCount, 5)
      return { asset, score }
    }).filter(item => item.score > 0 || terms.length === 0)
      .sort((a, b) => b.score - a.score || b.asset.updatedAt.localeCompare(a.asset.updatedAt))
    const results: AutomationAssetSummary[] = []
    let chars = 0
    const charBudget = this.policy.catalogTokenBudget * 4
    for (const item of scored) {
      const value = summary(item.asset)
      const size = JSON.stringify(value).length
      if (results.length >= this.policy.retrievalTopK || (results.length > 0 && chars + size > charBudget)) break
      results.push(value); chars += size
    }
    return results
  }

  noteRun(id: string, ok: boolean): void {
    const asset = this.requireAsset(id)
    if (ok) asset.successCount += 1
    else asset.failureCount += 1
    asset.lastRunAt = nowIso(); asset.updatedAt = asset.lastRunAt
    this.write()
  }

  /**
   * Record one runtime test as a credential bound to the content that ran. The asset's own `testStatus`
   * moves only if that content is still the asset's current content: a test that finishes after a newer
   * save leaves a credential for the old revision and changes nothing else.
   */
  noteTestResult(id: string, ok: boolean, url: string, evidenceLevel: EvidenceLevel = 'legacy-unverified', failureReason?: string, details: TestDetails = {}): void {
    const asset = this.requireAsset(id)
    if (asset.status !== 'draft') throw new Error('only draft automation assets can record test results')
    const domain = safeDomain(url)
    const currentHash = computeContentHash(asset)
    const tested = details.tested ?? { revision: asset.revision, contentHash: currentHash }
    const credential: TestCredential = {
      revision: tested.revision, contentHash: tested.contentHash, inputSchemaHash: details.inputSchemaHash ?? computeInputSchemaHash(asset), schemaVersion: asset.schemaVersion ?? 1,
      testedAt: nowIso(), inputsDigest: digestInputs(details.inputs),
      executionStatus: details.executionStatus ?? (ok ? 'completed' : 'failed'),
      validationStatus: details.validationStatus ?? (ok && evidenceLevel === 'verified' ? 'passed' : 'not_checked'),
      evidenceLevel: ok ? evidenceLevel : 'legacy-unverified', passed: ok,
      ...details.inputSets ? { inputSets: details.inputSets, plannedSets: details.plannedSets ?? details.inputSets.length } : {},
      ...details.warnings?.length ? { warnings: details.warnings } : {},
    }
    asset.testCredentials = [...asset.testCredentials ?? [], credential].slice(-this.policy.maxTestCredentials)
    if (tested.revision === asset.revision && tested.contentHash === currentHash) {
      asset.testStatus = ok ? 'passed' : 'failed'
      if (ok) asset.evidenceLevel = evidenceLevel
      else delete asset.evidenceLevel
      asset.testMessage = !ok ? (failureReason ?? `Runtime replay failed on ${domain}.`)
        : evidenceLevel === 'verified' ? `Runtime replay passed on ${domain}; every assert step held.`
          : `Runtime replay passed on ${domain}; no assert step checked the result (legacy-unverified).`
      if (ok && details.inputSets) asset.testMessage += ` ${details.inputSets.length} input sets, each in a fresh context.${details.warnings?.length ? ' ' + details.warnings.join(', ') + ': different inputs gave identical outputs.' : ''}`
    }
    asset.updatedAt = nowIso()
    this.write()
  }

  assertTarget(asset: AutomationAsset, url: string): void {
    const domain = safeDomain(url)
    if (!asset.domains.some(allowed => domain === allowed || domain.endsWith('.' + allowed))) throw new Error(`automation asset ${asset.id} is not allowed on ${domain}`)
  }

  private requireAsset(id: string): AutomationAsset {
    const asset = this.state.assets.find(item => item.id === id)
    if (!asset) throw new Error('automation asset not found')
    return asset
  }

  private prune(now = Date.now()): void {
    const cutoff = now - this.policy.candidateTtlDays * 86_400_000
    this.state.candidates = this.state.candidates.filter(item => Date.parse(item.lastSeenAt) >= cutoff)
      .sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt)).slice(0, this.policy.maxCandidates)
  }

  private read(): PersistedState {
    if (!fs.existsSync(this.statePath)) return structuredClone(DEFAULT_STATE)
    try { return persistedState(JSON.parse(fs.readFileSync(this.statePath, 'utf8'))) }
    catch (error) { throw new Error(`automation asset store is unreadable; refusing to overwrite ${this.statePath}: ${String(error)}`) }
  }

  private write(): void {
    fs.mkdirSync(this.policy.directory, { recursive: true })
    const temporary = this.statePath + '.tmp-' + uid().slice(0, 8)
    fs.writeFileSync(temporary, JSON.stringify(this.state, null, 2), { encoding: 'utf8', mode: 0o600 })
    fs.renameSync(temporary, this.statePath)
  }
}
