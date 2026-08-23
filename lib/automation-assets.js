/** Bounded, local automation-asset lifecycle and retrieval. */
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { validateUserscript } from "./scripts.js";
export const ASSET_PERSISTENCE_MODES = ['off', 'manual', 'suggest', 'auto-draft'];
export const ASSET_ACTIVATION_MODES = ['manual', 'auto-tested'];
const DEFAULT_STATE = { version: 1, candidates: [], assets: [] };
function boundedInteger(value, fallback, min, max) {
    return typeof value === 'number' && Number.isInteger(value) ? Math.min(Math.max(value, min), max) : fallback;
}
function boundedNumber(value, fallback, min, max) {
    return typeof value === 'number' && Number.isFinite(value) ? Math.min(Math.max(value, min), max) : fallback;
}
export function defaultAutomationAssetDirectory() {
    const home = process.env.DSH_HOME ?? path.join(os.homedir(), '.dsh');
    return path.join(home, 'data', 'browser', 'automations');
}
export function resolveAutomationAssetPolicy(input = {}) {
    const persistenceMode = input.persistenceMode ?? 'suggest';
    const activationMode = input.activationMode ?? 'manual';
    if (!ASSET_PERSISTENCE_MODES.includes(persistenceMode))
        throw new Error('automationAssets.persistenceMode is invalid');
    if (!ASSET_ACTIVATION_MODES.includes(activationMode))
        throw new Error('automationAssets.activationMode is invalid');
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
    };
}
function nowIso(now = Date.now()) { return new Date(now).toISOString(); }
function uid() { return crypto.randomUUID(); }
function hash(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function safeDomain(url) {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol))
        throw new Error('automation assets only support HTTP(S) URLs');
    return parsed.hostname.toLowerCase();
}
function cap(value, max) { return value.trim().slice(0, max); }
const SECRET_SELECTOR = /pass(word)?|token|secret|otp|one[-_ ]?time|credit|card|cvv|authorization/i;
function sanitizeSelector(selector) {
    return selector.replace(/\[\s*([-\w:]+)\s*[*^$|~]?=\s*(?:"[^"]*"|'[^']*'|[^\]]+)\]/g, '[$1]').slice(0, 500);
}
function inputPlaceholder(selector, secret) {
    if (secret)
        return 'secret';
    const hint = selector.match(/\[\s*name\s*=\s*["']?([^\]"']+)/i)?.[1]
        ?? selector.match(/#([\w-]+)/)?.[1]
        ?? selector.match(/\[\s*aria-label\s*=\s*["']?([^\]"']+)/i)?.[1];
    const suffix = hint?.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 24);
    return suffix ? `input_${suffix}` : 'input';
}
function recipeInputNames(steps) {
    return [...new Set(JSON.stringify(steps).match(/\{\{([a-zA-Z][\w-]*)\}\}/g)?.map(value => value.slice(2, -2)) ?? [])];
}
/** Remove concrete form values and non-semantic output from a successful recipe. */
export function normalizeRecipeForCandidate(steps) {
    if (!Array.isArray(steps) || steps.length < 1 || steps.length > 25)
        throw new Error('candidate recipe requires 1 to 25 steps');
    const normalized = steps.map((step) => {
        const clean = structuredClone(step);
        delete clean.text;
        if ('value' in clean) {
            const selector = 'selector' in clean ? String(clean.selector ?? '') : '';
            const secret = SECRET_SELECTOR.test(selector);
            clean.value = `{{${inputPlaceholder(selector, secret)}}}`;
        }
        if ('selector' in clean && typeof clean.selector === 'string')
            clean.selector = sanitizeSelector(clean.selector);
        if ('timeoutMs' in clean && typeof clean.timeoutMs === 'number')
            clean.timeoutMs = Math.min(Math.max(Math.round(clean.timeoutMs), 100), 60_000);
        if ('waitMs' in clean && typeof clean.waitMs === 'number')
            clean.waitMs = Math.min(Math.max(Math.round(clean.waitMs), 0), 10_000);
        return clean;
    });
    if (recipeInputNames(normalized).length > 20)
        throw new Error('candidate recipe exceeds 20 reusable inputs');
    return normalized;
}
function candidateFingerprint(domain, steps) {
    return hash(JSON.stringify({ domain, steps }));
}
function summary(asset) {
    const { id, kind, status, name, description, domains, tags, inputNames, revision, testStatus, successCount, failureCount, updatedAt, lastRunAt } = asset;
    return { id, kind, status, name, description, domains: [...domains], tags: [...tags], inputNames: [...inputNames], revision, testStatus, successCount, failureCount, updatedAt, ...lastRunAt ? { lastRunAt } : {} };
}
function persistedState(value) {
    if (!value || typeof value !== 'object')
        throw new Error('state root must be an object');
    const state = value;
    if (state.version !== 1 || !Array.isArray(state.candidates) || !Array.isArray(state.assets))
        throw new Error('unsupported or malformed state');
    if (state.candidates.length > 200 || state.assets.length > 300)
        throw new Error('state exceeds hard item limits');
    const malformedCandidate = state.candidates.some(candidate => !candidate || typeof candidate !== 'object'
        || typeof candidate.id !== 'string' || typeof candidate.fingerprint !== 'string' || typeof candidate.domain !== 'string'
        || !Array.isArray(candidate.steps) || candidate.steps.length < 1 || candidate.steps.length > 25
        || !Array.isArray(candidate.sessionIds) || candidate.sessionIds.length > 30
        || typeof candidate.successfulRuns !== 'number' || typeof candidate.failedRuns !== 'number'
        || !Number.isFinite(Date.parse(candidate.firstSeenAt)) || !Number.isFinite(Date.parse(candidate.lastSeenAt)));
    const malformedAsset = state.assets.some(asset => !asset || typeof asset !== 'object'
        || typeof asset.id !== 'string' || !['recipe', 'userscript'].includes(asset.kind) || !['draft', 'active', 'archived'].includes(asset.status)
        || typeof asset.name !== 'string' || asset.name.length > 120 || !Array.isArray(asset.domains) || asset.domains.length > 20
        || !Array.isArray(asset.tags) || asset.tags.length > 20 || !Array.isArray(asset.inputNames) || asset.inputNames.length > 20
        || (asset.kind === 'recipe' && (!Array.isArray(asset.recipe) || asset.recipe.length < 1 || asset.recipe.length > 25))
        || (asset.kind === 'userscript' && (typeof asset.source !== 'string' || Buffer.byteLength(asset.source, 'utf8') > 64 * 1024))
        || !Number.isInteger(asset.revision) || !Number.isFinite(Date.parse(asset.createdAt)) || !Number.isFinite(Date.parse(asset.updatedAt)));
    if (malformedCandidate || malformedAsset)
        throw new Error('persisted asset entries are malformed');
    return { version: 1, candidates: state.candidates, assets: state.assets };
}
export class AutomationAssetStore {
    policy;
    statePath;
    state;
    constructor(policy) {
        this.policy = policy;
        this.statePath = path.join(policy.directory, 'assets.json');
        this.state = this.read();
        this.prune();
    }
    snapshot() {
        const { directory: _directory, ...publicPolicy } = this.policy;
        return {
            policy: publicPolicy,
            candidates: this.state.candidates.map(({ id, domain, title, successfulRuns, failedRuns, sessionIds, firstSeenAt, lastSeenAt, suggestedAt, dismissedAt }) => ({
                id, domain, title, successfulRuns, failedRuns, distinctSessions: sessionIds.length, firstSeenAt, lastSeenAt,
                ...suggestedAt ? { suggestedAt } : {}, ...dismissedAt ? { dismissedAt } : {},
            })),
            assets: this.state.assets.map(summary),
        };
    }
    get(id) {
        const asset = this.state.assets.find(item => item.id === id);
        return asset ? structuredClone(asset) : undefined;
    }
    recordRecipe(url, steps, sessionId, ok, now = Date.now()) {
        if (!this.policy.enabled || !['suggest', 'auto-draft'].includes(this.policy.persistenceMode))
            return undefined;
        const domain = safeDomain(url);
        const normalized = normalizeRecipeForCandidate(steps);
        const fingerprint = candidateFingerprint(domain, normalized);
        const timestamp = nowIso(now);
        let candidate = this.state.candidates.find(item => item.fingerprint === fingerprint);
        if (!candidate) {
            candidate = { id: uid(), fingerprint, domain, title: `Reusable automation for ${domain}`, steps: normalized, successfulRuns: 0, failedRuns: 0, sessionIds: [], firstSeenAt: timestamp, lastSeenAt: timestamp };
            this.state.candidates.push(candidate);
        }
        const windowStart = now - this.policy.successWindowDays * 86_400_000;
        if (Date.parse(candidate.firstSeenAt) < windowStart) {
            candidate.successfulRuns = 0;
            candidate.failedRuns = 0;
            candidate.sessionIds = [];
            candidate.firstSeenAt = timestamp;
            candidate.suggestedAt = undefined;
        }
        if (ok)
            candidate.successfulRuns += 1;
        else
            candidate.failedRuns += 1;
        candidate.lastSeenAt = timestamp;
        const sessionKey = sessionId ? hash(sessionId).slice(0, 16) : '';
        if (sessionKey && !candidate.sessionIds.includes(sessionKey))
            candidate.sessionIds.push(sessionKey);
        candidate.sessionIds = candidate.sessionIds.slice(-this.policy.minDistinctSessions * 3);
        const total = candidate.successfulRuns + candidate.failedRuns;
        const eligible = candidate.successfulRuns >= this.policy.minSuccessfulRuns
            && candidate.sessionIds.length >= this.policy.minDistinctSessions
            && candidate.successfulRuns / total >= this.policy.minSuccessRate;
        const day = timestamp.slice(0, 10);
        const suggestionsToday = this.state.candidates.filter(item => item.suggestedAt?.startsWith(day)).length;
        if (eligible && !candidate.suggestedAt && !candidate.dismissedAt && suggestionsToday < this.policy.maxSuggestionsPerDay)
            candidate.suggestedAt = timestamp;
        this.prune(now);
        this.write();
        if (this.policy.persistenceMode === 'auto-draft' && candidate.suggestedAt && !this.state.assets.some(item => item.tags.includes(`candidate:${candidate.id}`))) {
            this.summarizeCandidate(candidate.id);
        }
        return structuredClone(candidate);
    }
    summarizeCandidate(id) {
        const candidate = this.state.candidates.find(item => item.id === id);
        if (!candidate)
            throw new Error('automation candidate not found');
        if (this.state.assets.filter(item => item.status === 'draft').length >= this.policy.maxDrafts)
            throw new Error('automation draft limit reached');
        const timestamp = nowIso();
        const asset = {
            id: uid(), kind: 'recipe', status: 'draft', name: candidate.title, description: `Captured from ${candidate.successfulRuns} successful runs across ${candidate.sessionIds.length} sessions.`,
            domains: [candidate.domain], tags: [`candidate:${candidate.id}`], inputNames: recipeInputNames(candidate.steps), recipe: structuredClone(candidate.steps), revision: 1,
            testStatus: 'untested', successCount: 0, failureCount: 0, createdAt: timestamp, updatedAt: timestamp,
        };
        this.state.assets.push(asset);
        candidate.dismissedAt = timestamp;
        this.write();
        return structuredClone(asset);
    }
    dismissCandidate(id) {
        const candidate = this.state.candidates.find(item => item.id === id);
        if (!candidate)
            throw new Error('automation candidate not found');
        candidate.dismissedAt = nowIso();
        this.write();
    }
    saveDraft(input) {
        if (!this.policy.enabled || this.policy.persistenceMode === 'off')
            throw new Error('automation asset persistence is disabled');
        const existing = input.id ? this.state.assets.find(item => item.id === input.id) : undefined;
        if (existing?.status === 'active')
            throw new Error('active assets must be copied to a draft before editing');
        if (!existing && this.state.assets.filter(item => item.status === 'draft').length >= this.policy.maxDrafts)
            throw new Error('automation draft limit reached');
        const timestamp = nowIso();
        const name = cap(input.name, 120);
        if (!name)
            throw new Error('automation asset name is required');
        const kind = input.kind;
        const domains = [...new Set((input.domains ?? []).map(value => cap(String(value).toLowerCase(), 255)).filter(Boolean))].slice(0, 20);
        const tags = [...new Set((input.tags ?? []).map(value => cap(String(value), 40)).filter(Boolean))].slice(0, 20);
        const declaredInputNames = [...new Set((input.inputNames ?? []).map(value => cap(String(value), 40)).filter(value => /^[a-zA-Z][\w-]*$/.test(value)))].slice(0, 20);
        if (kind === 'recipe' && (!Array.isArray(input.recipe) || input.recipe.length < 1 || input.recipe.length > 25))
            throw new Error('recipe asset requires 1 to 25 steps');
        if (kind === 'userscript') {
            const validation = validateUserscript(String(input.source ?? ''));
            if (!validation.valid)
                throw new Error('userscript is invalid: ' + validation.errors.join('; '));
        }
        const inputNames = kind === 'recipe' ? recipeInputNames(input.recipe) : declaredInputNames;
        const asset = {
            id: existing?.id ?? uid(), kind, status: 'draft', name, description: cap(String(input.description ?? ''), 500), domains, tags, inputNames,
            ...kind === 'recipe' ? { recipe: structuredClone(input.recipe) } : { source: String(input.source) },
            revision: (existing?.revision ?? 0) + 1, testStatus: 'untested', successCount: existing?.successCount ?? 0, failureCount: existing?.failureCount ?? 0,
            createdAt: existing?.createdAt ?? timestamp, updatedAt: timestamp, ...existing?.lastRunAt ? { lastRunAt: existing.lastRunAt } : {},
        };
        if (existing)
            this.state.assets[this.state.assets.indexOf(existing)] = asset;
        else
            this.state.assets.push(asset);
        this.write();
        return structuredClone(asset);
    }
    test(id) {
        const asset = this.requireAsset(id);
        let message = 'Recipe structure is valid.';
        if (asset.kind === 'recipe')
            normalizeRecipeForCandidate(asset.recipe ?? []);
        else {
            const validation = validateUserscript(asset.source ?? '');
            if (!validation.valid)
                throw new Error(validation.errors.join('; '));
            message = `Userscript validated (${validation.sha256.slice(0, 12)}).`;
        }
        asset.testStatus = 'passed';
        asset.testMessage = message;
        asset.updatedAt = nowIso();
        this.write();
        return structuredClone(asset);
    }
    setStatus(id, status) {
        const asset = this.requireAsset(id);
        if (!['draft', 'active', 'archived'].includes(status))
            throw new Error('invalid automation asset status');
        if (status === 'active') {
            if (asset.testStatus !== 'passed')
                throw new Error('automation asset must pass testing before activation');
            if (asset.domains.length < 1)
                throw new Error('automation asset must declare at least one domain before activation');
            if (this.state.assets.filter(item => item.status === 'active' && item.id !== id).length >= this.policy.maxActiveAssets)
                throw new Error('active automation asset limit reached');
        }
        asset.status = status;
        asset.updatedAt = nowIso();
        this.write();
        return structuredClone(asset);
    }
    search(query, domain) {
        const terms = `${query} ${domain ?? ''}`.slice(0, 2_000).toLowerCase().split(/[^\p{L}\p{N}_.-]+/u).filter(Boolean).slice(0, 20);
        const normalizedDomain = domain?.toLowerCase();
        const scored = this.state.assets.filter(item => item.status === 'active').map(asset => {
            const haystack = [asset.name, asset.description, ...asset.domains, ...asset.tags, ...asset.inputNames].join(' ').toLowerCase();
            let score = terms.reduce((sum, term) => sum + (haystack.includes(term) ? 4 : 0), 0);
            if (normalizedDomain && asset.domains.some(value => normalizedDomain === value || normalizedDomain.endsWith('.' + value)))
                score += 12;
            score += Math.min(asset.successCount, 10) - Math.min(asset.failureCount, 5);
            return { asset, score };
        }).filter(item => item.score > 0 || terms.length === 0)
            .sort((a, b) => b.score - a.score || b.asset.updatedAt.localeCompare(a.asset.updatedAt));
        const results = [];
        let chars = 0;
        const charBudget = this.policy.catalogTokenBudget * 4;
        for (const item of scored) {
            const value = summary(item.asset);
            const size = JSON.stringify(value).length;
            if (results.length >= this.policy.retrievalTopK || (results.length > 0 && chars + size > charBudget))
                break;
            results.push(value);
            chars += size;
        }
        return results;
    }
    noteRun(id, ok) {
        const asset = this.requireAsset(id);
        if (ok)
            asset.successCount += 1;
        else
            asset.failureCount += 1;
        asset.lastRunAt = nowIso();
        asset.updatedAt = asset.lastRunAt;
        this.write();
    }
    assertTarget(asset, url) {
        const domain = safeDomain(url);
        if (!asset.domains.some(allowed => domain === allowed || domain.endsWith('.' + allowed)))
            throw new Error(`automation asset ${asset.id} is not allowed on ${domain}`);
    }
    requireAsset(id) {
        const asset = this.state.assets.find(item => item.id === id);
        if (!asset)
            throw new Error('automation asset not found');
        return asset;
    }
    prune(now = Date.now()) {
        const cutoff = now - this.policy.candidateTtlDays * 86_400_000;
        this.state.candidates = this.state.candidates.filter(item => Date.parse(item.lastSeenAt) >= cutoff)
            .sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt)).slice(0, this.policy.maxCandidates);
    }
    read() {
        if (!fs.existsSync(this.statePath))
            return structuredClone(DEFAULT_STATE);
        try {
            return persistedState(JSON.parse(fs.readFileSync(this.statePath, 'utf8')));
        }
        catch (error) {
            throw new Error(`automation asset store is unreadable; refusing to overwrite ${this.statePath}: ${String(error)}`);
        }
    }
    write() {
        fs.mkdirSync(this.policy.directory, { recursive: true });
        const temporary = this.statePath + '.tmp-' + uid().slice(0, 8);
        fs.writeFileSync(temporary, JSON.stringify(this.state, null, 2), { encoding: 'utf8', mode: 0o600 });
        fs.renameSync(temporary, this.statePath);
    }
}
//# sourceMappingURL=automation-assets.js.map