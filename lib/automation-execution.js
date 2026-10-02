/** Shared guarded execution for active assets and draft runtime replay. */
import { coerceInputs, materializeDeep } from "./automation-v2.js";
import { computeContentHash } from "./automation-assets.js";
import { mapError } from "./actions/errors.js";
const RUN_FIELDS = ['executionStatus', 'validationStatus', 'completedSteps', 'failedStep', 'effects', 'outputs', 'message', 'legacyFallback', 'steps'];
/** Split the service's recipe result into the run report and the page state. Tolerates a service that predates B2. */
function splitRecipeResult(raw) {
    const record = (raw && typeof raw === 'object' ? raw : {});
    const page = Object.fromEntries(Object.entries(record).filter(([key]) => !RUN_FIELDS.includes(key)));
    if (typeof record.executionStatus !== 'string') {
        return { run: { executionStatus: 'completed', validationStatus: 'not_checked', completedSteps: Array.isArray(record.steps) ? record.steps : [], effects: 'unknown', outputs: [] }, page };
    }
    const run = {
        executionStatus: record.executionStatus,
        validationStatus: (record.validationStatus ?? 'not_checked'),
        completedSteps: (record.completedSteps ?? []),
        ...record.failedStep ? { failedStep: record.failedStep } : {},
        effects: (record.effects ?? 'unknown'),
        outputs: (record.outputs ?? []),
        ...typeof record.message === 'string' ? { message: record.message } : {},
        ...record.legacyFallback ? { legacyFallback: true } : {},
    };
    return { run, page };
}
function materialize(value, inputs) {
    return value.replace(/\{\{([a-zA-Z][\w-]*)\}\}/g, (_match, name) => {
        if (!(name in inputs))
            throw new Error(`missing automation input: ${name}`);
        return inputs[name];
    });
}
function materializeRecipe(steps, inputs) {
    return steps.map(step => {
        const copy = structuredClone(step);
        for (const key of ['value', 'text'])
            if (typeof copy[key] === 'string')
                copy[key] = materialize(copy[key], inputs);
        return copy;
    });
}
export function automationInputs(asset, raw) {
    const inputs = raw && typeof raw === 'object' && !Array.isArray(raw)
        ? Object.fromEntries(Object.entries(raw).map(([key, value]) => [key, String(value)])) : {};
    if (Object.keys(inputs).length > 20 || Object.entries(inputs).some(([key, value]) => !/^[a-zA-Z][\w-]{0,39}$/.test(key) || value.length > 10_000))
        throw new Error('automation inputs exceed key, count, or value limits');
    const missing = asset.inputNames.filter(name => !(name in inputs));
    const extra = Object.keys(inputs).filter(name => !asset.inputNames.includes(name));
    if (missing.length)
        throw new Error('missing declared automation inputs: ' + missing.join(', '));
    if (extra.length)
        throw new Error('undeclared automation inputs: ' + extra.join(', '));
    return inputs;
}
/** A v2 asset can only count as tested when something checks the business result. */
const NO_VERIFIER = 'The steps ran, but this v2 recipe has no assert step and no postcondition, so nothing verified the result and the test cannot pass. Add an assert step or a postcondition that proves the outcome, save, and test again.';
function hasVerifier(asset) {
    return (asset.recipe ?? []).some(step => step.type === 'assert') || (asset.postconditions?.length ?? 0) > 0;
}
export async function executeAutomationAsset(service, store, id, url, rawInputs, requiredStatus, options = {}) {
    const asset = store.get(id);
    if (!asset || asset.status !== requiredStatus)
        throw new Error(`${requiredStatus} automation asset not found`);
    if (options.expectedRevision !== undefined && options.expectedRevision !== asset.revision) {
        throw new Error(`revision mismatch: asked to test revision ${options.expectedRevision}, but the asset is at revision ${asset.revision}; reload it and test again`);
    }
    const v2 = asset.kind === 'recipe' && asset.schemaVersion === 2;
    // The credential left by a test names the revision and content that actually ran, even if the asset is saved again meanwhile.
    const tested = { revision: asset.revision, contentHash: asset.contentHash ?? computeContentHash(asset) };
    // v2 assets with an inputSchema validate and convert inputs by type; everything else keeps the v1 string rules.
    const inputs = v2 && asset.inputSchema ? coerceInputs(asset.inputSchema, rawInputs) : automationInputs(asset, rawInputs);
    store.assertTarget(asset, url);
    let value;
    let run;
    try {
        if (asset.kind === 'recipe') {
            // legacyRecipe: stored assets keep their pre-B2 behaviour for an unknown extract mode (reported as legacyFallback).
            const common = { url, signal: options.signal, ...options.authProfile ? { authProfile: options.authProfile } : {}, ...options.rulePack ? { rulePack: options.rulePack } : {}, session: options.session };
            const result = v2
                ? await service.recipe(materializeDeep(asset.recipe ?? [], inputs), {
                    ...common, schemaVersion: 2,
                    ...asset.postconditions ? { postconditions: materializeDeep(asset.postconditions, inputs) } : {},
                    ...asset.outputSchema ? { outputSchema: asset.outputSchema } : {},
                    allowedDomains: asset.domains,
                })
                : await service.recipe(materializeRecipe(asset.recipe ?? [], inputs), { ...common, legacyRecipe: true });
            ({ run, page: value } = splitRecipeResult(result));
        }
        else {
            try {
                value = await service.runUserscript(url, asset.source ?? '', { signal: options.signal, inputs, ...options.authProfile ? { authProfile: options.authProfile } : {}, ...options.rulePack ? { rulePack: options.rulePack } : {} });
                run = { executionStatus: 'completed', validationStatus: 'not_checked', completedSteps: [], effects: 'unknown', outputs: [] };
            }
            catch (error) {
                // A UserScript is one opaque step: a throw is a failed run, reported in the same structure as a recipe.
                const body = mapError(error, 'script.run_userscript', { signal: options.signal });
                value = undefined;
                run = {
                    executionStatus: body.code === 'CANCELLED' ? 'cancelled' : 'failed', validationStatus: 'not_checked', completedSteps: [], effects: 'unknown', outputs: [],
                    failedStep: { index: 1, action: 'userscript', errorCode: body.code, message: body.message },
                    message: 'The UserScript ' + (body.code === 'CANCELLED' ? 'was cancelled' : 'threw') + '; its side effects, if any, are not rolled back.',
                };
            }
        }
    }
    catch (error) {
        // Nothing ran: no page, navigation failure, or a malformed recipe.
        if (requiredStatus === 'active')
            store.noteRun(asset.id, false);
        else
            store.noteTestResult(asset.id, false, url, 'legacy-unverified', undefined, { inputs, tested, executionStatus: 'failed', validationStatus: 'not_checked' });
        throw error;
    }
    let succeeded = run.executionStatus === 'completed' && run.validationStatus !== 'failed';
    const evidenceLevel = run.validationStatus === 'passed' ? 'verified' : 'legacy-unverified';
    let failureReason;
    let verifierMissing;
    if (requiredStatus === 'draft' && v2 && succeeded && !hasVerifier(asset)) {
        // v1 keeps its old gate (a passing test without asserts is legacy-unverified); a v2 asset must verify its result.
        succeeded = false;
        failureReason = NO_VERIFIER;
        verifierMissing = { message: NO_VERIFIER };
        run = { ...run, message: NO_VERIFIER };
    }
    if (requiredStatus === 'active')
        store.noteRun(asset.id, succeeded);
    else
        store.noteTestResult(asset.id, succeeded, url, evidenceLevel, failureReason, { inputs, tested, executionStatus: run.executionStatus, validationStatus: run.validationStatus });
    return { asset: store.get(asset.id), value, execution: { ...run, evidenceLevel }, succeeded, ...verifierMissing ? { verifierMissing } : {} };
}
//# sourceMappingURL=automation-execution.js.map