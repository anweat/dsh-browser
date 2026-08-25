/** Shared guarded execution for active assets and draft runtime replay. */
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
export async function executeAutomationAsset(service, store, id, url, rawInputs, requiredStatus, options = {}) {
    const asset = store.get(id);
    if (!asset || asset.status !== requiredStatus)
        throw new Error(`${requiredStatus} automation asset not found`);
    const inputs = automationInputs(asset, rawInputs);
    store.assertTarget(asset, url);
    try {
        const value = asset.kind === 'recipe'
            ? await service.recipe(materializeRecipe(asset.recipe ?? [], inputs), { url, signal: options.signal, ...options.authProfile ? { authProfile: options.authProfile } : {}, ...options.rulePack ? { rulePack: options.rulePack } : {} })
            : await service.runUserscript(url, asset.source ?? '', { signal: options.signal, inputs, ...options.authProfile ? { authProfile: options.authProfile } : {}, ...options.rulePack ? { rulePack: options.rulePack } : {} });
        if (requiredStatus === 'active')
            store.noteRun(asset.id, true);
        else
            store.noteTestResult(asset.id, true, url);
        return { asset: store.get(asset.id), value };
    }
    catch (error) {
        if (requiredStatus === 'active')
            store.noteRun(asset.id, false);
        else
            store.noteTestResult(asset.id, false, url);
        throw error;
    }
}
//# sourceMappingURL=automation-execution.js.map