/** Shared guarded execution for active assets and draft runtime replay. */
import { coerceInputs, materializeDeep } from "./automation-v2.js";
import { computeContentHash, digestInputs } from "./automation-assets.js";
import { mapError } from "./actions/errors.js";
import { INPUT_SET_MAX, INPUT_SET_MIN } from "./activation-rules.js";
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
/** Run the asset once with already-validated inputs. Throws when nothing ran (no page, bad navigation, malformed recipe). */
async function runAssetOnce(service, asset, v2, url, inputs, options) {
    let value;
    let run;
    if (asset.kind === 'recipe') {
        // legacyRecipe: stored assets keep their pre-B2 behaviour for an unknown extract mode (reported as legacyFallback).
        const common = { url, signal: options.signal, ...options.authProfile ? { authProfile: options.authProfile } : {}, ...options.rulePack ? { rulePack: options.rulePack } : {}, session: options.session, ...options.isolated ? { isolated: true } : {} };
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
    return { value, run };
}
function loadAsset(store, id, requiredStatus, options) {
    const asset = store.get(id);
    if (!asset || asset.status !== requiredStatus)
        throw new Error(`${requiredStatus} automation asset not found`);
    if (options.expectedRevision !== undefined && options.expectedRevision !== asset.revision) {
        throw new Error(`revision mismatch: asked to test revision ${options.expectedRevision}, but the asset is at revision ${asset.revision}; reload it and test again`);
    }
    const v2 = asset.kind === 'recipe' && asset.schemaVersion === 2;
    // The credential left by a test names the revision and content that actually ran, even if the asset is saved again meanwhile.
    return { asset, v2, tested: { revision: asset.revision, contentHash: asset.contentHash ?? computeContentHash(asset) } };
}
/** v2 assets with an inputSchema validate and convert inputs by type; everything else keeps the v1 string rules. */
function coerceFor(asset, v2, raw) {
    return v2 && asset.inputSchema ? coerceInputs(asset.inputSchema, raw) : automationInputs(asset, raw);
}
export async function executeAutomationAsset(service, store, id, url, rawInputs, requiredStatus, options = {}) {
    const { asset, v2, tested } = loadAsset(store, id, requiredStatus, options);
    const inputs = coerceFor(asset, v2, rawInputs);
    store.assertTarget(asset, url);
    let value;
    let run;
    try {
        ;
        ({ value, run } = await runAssetOnce(service, asset, v2, url, inputs, options));
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
// --- independent replay with several input sets --------------------------------
export { INPUT_SET_MIN, INPUT_SET_MAX };
export const PARAMETERIZATION_SUSPECT = 'PARAMETERIZATION_SUSPECT';
/**
 * Test a draft with 2 to 5 input sets, each in its own fresh BrowserContext, never in the session's page.
 * Every set must pass for the test to pass. A passing test is only suspicious (not failed) when different
 * inputs gave identical outputs; the credential then carries `PARAMETERIZATION_SUSPECT`.
 */
export async function executeDraftInputSets(service, store, id, url, rawSets, options = {}) {
    if (!Array.isArray(rawSets) || rawSets.length < INPUT_SET_MIN || rawSets.length > INPUT_SET_MAX)
        throw new Error(`inputSets must list ${INPUT_SET_MIN} to ${INPUT_SET_MAX} input objects`);
    const { asset, v2, tested } = loadAsset(store, id, 'draft', options);
    // Every set is validated before the browser is touched, so a typo in the last one costs nothing.
    const sets = rawSets.map(raw => coerceFor(asset, v2, raw));
    const digests = sets.map(inputs => digestInputs(inputs));
    if (new Set(digests).size !== digests.length)
        throw new Error('inputSets must differ from each other: two sets have identical inputs, so they cannot show that the inputs change the result');
    store.assertTarget(asset, url);
    const results = [];
    for (const [index, inputs] of sets.entries()) {
        let outcome;
        try {
            outcome = await runAssetOnce(service, asset, v2, url, inputs, { ...options, isolated: true });
        }
        catch (error) {
            const body = mapError(error, 'recipe.run', { signal: options.signal });
            outcome = { value: undefined, run: { executionStatus: body.code === 'CANCELLED' ? 'cancelled' : 'failed', validationStatus: 'not_checked', completedSteps: [], effects: 'none', outputs: [], failedStep: { index: 1, action: 'goto', errorCode: body.code, message: body.message }, message: `Nothing ran for input set ${index + 1}: ${body.message}` } };
        }
        const { value, run } = outcome;
        const passed = run.executionStatus === 'completed' && run.validationStatus !== 'failed';
        const produced = asset.kind === 'recipe' ? run.outputs.filter(output => output.action === 'extract').map(output => ({ name: output.name, value: output.value })) : value;
        results.push({ index, inputsDigest: digests[index], passed, execution: { ...run, evidenceLevel: run.validationStatus === 'passed' ? 'verified' : 'legacy-unverified' }, produced, outputsDigest: digestInputs(produced) });
        if (!passed)
            break;
    }
    const allPassed = results.length === sets.length && results.every(entry => entry.passed);
    let succeeded = allPassed;
    let verifierMissing;
    let failureReason;
    if (succeeded && v2 && !hasVerifier(asset)) {
        succeeded = false;
        verifierMissing = { message: NO_VERIFIER };
        failureReason = NO_VERIFIER;
    }
    const failed = results.find(entry => !entry.passed);
    if (failed && !failureReason)
        failureReason = `Input set ${failed.index + 1} of ${sets.length} did not pass (${failed.execution.failedStep?.errorCode ?? failed.execution.executionStatus}); ${results.length < sets.length ? 'the remaining sets were not run' : 'no other set remained'}.`;
    // Pairs of sets that got the same output from different inputs.
    const identical = [];
    if (allPassed) {
        for (let a = 0; a < results.length; a += 1)
            for (let b = a + 1; b < results.length; b += 1)
                if (results[a].outputsDigest === results[b].outputsDigest)
                    identical.push([a, b]);
    }
    const suspect = identical.length > 0;
    const evidenceLevel = allPassed && results.every(entry => entry.execution.validationStatus === 'passed') ? 'verified' : 'legacy-unverified';
    const aggregate = failed ?? results[results.length - 1];
    store.noteTestResult(asset.id, succeeded, url, evidenceLevel, failureReason, {
        inputs: sets, tested, executionStatus: aggregate.execution.executionStatus, validationStatus: failed ? (failed.execution.validationStatus) : (evidenceLevel === 'verified' ? 'passed' : 'not_checked'),
        inputSets: results.map(entry => ({ index: entry.index, inputsDigest: entry.inputsDigest, passed: entry.passed, executionStatus: entry.execution.executionStatus, validationStatus: entry.execution.validationStatus, outputsDigest: entry.outputsDigest })),
        plannedSets: sets.length,
        ...suspect ? { warnings: [PARAMETERIZATION_SUSPECT] } : {},
    });
    return { asset: store.get(asset.id), succeeded, sets: results, planned: sets.length, ...verifierMissing ? { verifierMissing } : {}, identicalOutputs: identical, suspect };
}
//# sourceMappingURL=automation-execution.js.map