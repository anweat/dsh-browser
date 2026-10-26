/**
 * The keys of the two policy objects as controls: which kind each is, its unit, its range and its default, and how a
 * typed text becomes a value. Pure, and built on `../policy-keys.ts` (the one place the ranges and defaults live).
 * @module dsh-browser/client/policy-fields
 */
import { ASSET_POLICY_BOUNDS, ASSET_POLICY_DEFAULTS, ASSET_POLICY_ENUMS, USAGE_POLICY_BOUNDS, USAGE_POLICY_DEFAULTS, } from "../policy-keys.js";
const usage = (key, unit) => ({ key, kind: 'int', unit });
export const POLICY_SPECS = {
    usagePolicy: [
        usage('minDelayMs', 'ms'), usage('maxConcurrency', 'count'), usage('burst', 'count'), usage('maxPagesPerRun', 'count'),
        usage('maxDepth', 'count'), usage('retryLimit', 'count'), usage('backoffBaseMs', 'ms'), usage('cooldownMs', 'ms'),
    ],
    automationAssets: [
        { key: 'persistenceMode', kind: 'enum', options: ASSET_POLICY_ENUMS.persistenceMode, section: 'candidates' },
        { key: 'minSuccessfulRuns', kind: 'int', unit: 'count', section: 'candidates' },
        { key: 'minDistinctSessions', kind: 'int', unit: 'count', section: 'candidates' },
        { key: 'successWindowDays', kind: 'int', unit: 'days', section: 'candidates' },
        { key: 'minSuccessRate', kind: 'float', unit: 'ratio', section: 'candidates' },
        { key: 'maxCandidates', kind: 'int', unit: 'count', section: 'candidates' },
        { key: 'candidateTtlDays', kind: 'int', unit: 'days', section: 'candidates' },
        { key: 'maxSuggestionsPerDay', kind: 'int', unit: 'count', section: 'candidates' },
        { key: 'enabled', kind: 'bool', section: 'library' },
        { key: 'directory', kind: 'text', section: 'library' },
        { key: 'maxDrafts', kind: 'int', unit: 'count', section: 'library' },
        { key: 'maxActiveAssets', kind: 'int', unit: 'count', section: 'library' },
        { key: 'retrievalTopK', kind: 'int', unit: 'count', section: 'library' },
        { key: 'catalogTokenBudget', kind: 'int', unit: 'tokens', section: 'library' },
        { key: 'activationMode', kind: 'enum', options: ASSET_POLICY_ENUMS.activationMode, section: 'activation' },
        { key: 'modelDevelopmentEnabled', kind: 'bool', section: 'activation' },
        { key: 'maxModelDraftWritesPerSession', kind: 'int', unit: 'count', section: 'activation' },
        { key: 'maxTestCredentials', kind: 'int', unit: 'count', section: 'activation' },
        { key: 'minInputSetsForActivation', kind: 'int', unit: 'count', section: 'activation' },
    ],
};
/** The default of a key; undefined when it has none (the assets directory). */
export function defaultOf(field, key) {
    return (field === 'usagePolicy' ? USAGE_POLICY_DEFAULTS : ASSET_POLICY_DEFAULTS)[key];
}
/** The inclusive range of a numeric key. */
export function boundsOf(field, key) {
    return field === 'usagePolicy' ? USAGE_POLICY_BOUNDS[key] : ASSET_POLICY_BOUNDS[key];
}
/** A value as the text a control shows. */
export function valueText(value) {
    return value === undefined || value === null ? '' : String(value);
}
/** What a typed text means for one key; an empty text means "the default" (no value). */
export function parsePolicyText(field, spec, text) {
    const trimmed = text.trim();
    if (trimmed === '')
        return { ok: true, value: undefined };
    switch (spec.kind) {
        case 'bool': return trimmed === 'true' || trimmed === 'false' ? { ok: true, value: trimmed === 'true' } : { ok: false, problem: 'invalidChoice' };
        case 'enum': return spec.options?.includes(trimmed) ? { ok: true, value: trimmed } : { ok: false, problem: 'invalidChoice' };
        case 'text': return { ok: true, value: trimmed };
        case 'int':
        case 'float': {
            const value = Number(trimmed);
            if (!Number.isFinite(value) || (spec.kind === 'int' && !Number.isInteger(value)))
                return { ok: false, problem: 'invalidNumber' };
            const range = boundsOf(field, spec.key);
            return !range || (value >= range[0] && value <= range[1]) ? { ok: true, value } : { ok: false, problem: 'invalidRange' };
        }
    }
}
//# sourceMappingURL=policy-fields.js.map