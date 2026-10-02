/** `automation` group: reusable assets and inline recipes. @module dsh-browser/actions/automation */
import { ActionUnavailableError, withOutcome } from "./types.js";
import { RecipeValidationError } from "./errors.js";
import { normalizePostconditions } from "../automation-v2.js";
import { executeAutomationAsset } from "../automation-execution.js";
import { capJson, recipeOutcome } from "./shared.js";
/** After the deadline aborts a recipe, how long to wait for its in-flight step to return (a step times out within 30 s). */
const RECIPE_SETTLE_MS = 40_000;
const DEVELOP_LIMIT = 100_000;
/** Wrap an asset-development result: structured when small, truncated JSON text when large. */
function developmentResult(action, value, asset) {
    const capped = capJson(value, DEVELOP_LIMIT);
    return { action, ...asset ? { assetId: asset.id, status: asset.status } : {}, result: capped.value, truncated: capped.truncated };
}
export const AUTOMATION_ACTIONS = [
    {
        name: 'automation.search',
        group: 'automation',
        summary: 'Search reusable browser automations by task keywords and optional domain; compact metadata only.',
        notes: 'Run this at the start of a task: a verified asset can be run with automation.run instead of re-exploring. Never returns recipe steps or userscript source.',
        params: {
            query: { type: 'string', required: true, description: 'Short task description.' },
            domain: { type: 'string', description: 'Optional target hostname.' },
            status: { type: 'string', enum: ['active', 'draft', 'archived', 'all'], description: 'Asset lifecycle scope. Defaults to active.' },
            kind: { type: 'string', enum: ['recipe', 'userscript'], description: 'Optional asset kind.' },
        },
        approval: 'none', readOnly: true, mutating: false, concurrencySafe: true, timeoutMs: 10_000,
        examples: [{ args: { query: 'search issues', domain: 'github.com' } }],
        async execute(args, ctx) {
            return { items: ctx.assets?.search(args.query, args.domain, args.status, args.kind) ?? [] };
        },
    },
    {
        name: 'automation.develop',
        group: 'automation',
        summary: 'Get, save, validate, test, or convert (v1 to v2) one automation draft. Never activates assets.',
        notes: 'save replaces the whole draft. v2 steps use locator (strict: several matches => LOCATOR_AMBIGUOUS, step not run); a v2 test needs an assert or postcondition. convert: v1 -> NEW v2 draft.',
        params: {
            action: { type: 'string', required: true, enum: ['get', 'save', 'validate', 'test', 'convert'] },
            id: { type: 'string', description: 'asset id; omit on save to create' },
            kind: { type: 'string', enum: ['recipe', 'userscript'], description: 'save' },
            name: { type: 'string', description: 'save' },
            description: { type: 'string' },
            domains: { type: 'array', items: { type: 'string' } },
            tags: { type: 'array', items: { type: 'string' }, description: 'retrieval keywords' },
            inputNames: { type: 'array', items: { type: 'string' }, description: 'UserScript input keys' },
            schemaVersion: { type: 'number', description: '1 or 2; use 2 (omitted: new=1, edit keeps)' },
            recipe: { type: 'array', items: { ref: 'recipeStep' }, description: '1-25 steps.' },
            inputSchema: { type: 'array', items: { ref: 'inputSpec' }, description: 'v2 typed inputs.' },
            outputSchema: { type: 'array', items: { ref: 'outputSpec' }, description: 'v2 named outputs.' },
            postconditions: { type: 'array', items: { ref: 'postcondition' }, description: 'v2: verified after the steps' },
            requiredCapabilities: { type: 'array', items: { type: 'string' }, description: 'v2: recorded only' },
            source: { type: 'string', description: 'UserScript' },
            url: { type: 'string', description: 'test: inside the draft domains' },
            inputs: { type: 'object', additionalProperties: true, description: 'test inputs' },
            authProfile: { type: 'string' },
            rulePack: { type: 'string' },
        },
        approval: 'asset-develop', readOnly: true, mutating: false, concurrencySafe: false, timeoutMs: 30_000, settleMs: RECIPE_SETTLE_MS,
        errors: ['VALIDATION_FAILED', 'OUTCOME_UNKNOWN'],
        examples: [
            {
                args: {
                    action: 'save', kind: 'recipe', schemaVersion: 2, name: 'Search', domains: ['example.com'],
                    recipe: [
                        { type: 'fill', locator: { label: 'Query' }, value: '{{query}}' },
                        { type: 'click', locator: { role: 'button', name: 'Search' } },
                        { type: 'extract', locator: { css: '#results' }, as: 'results' },
                    ],
                    postconditions: [{ output: 'results', nonEmpty: true }],
                },
            },
        ],
        async execute(args, ctx) {
            const { assets, development } = ctx;
            if (!assets || !development)
                throw new ActionUnavailableError('model automation development is disabled');
            if (args.action === 'get') {
                if (!args.id)
                    throw new Error('automation development get requires id');
                const asset = development.get(args.id);
                return developmentResult('get', asset, asset);
            }
            if (args.action === 'validate') {
                if (!args.id)
                    throw new Error('automation development validate requires id');
                const asset = development.validate(args.id);
                return developmentResult('validate', { id: asset.id, kind: asset.kind, status: asset.status, testStatus: asset.testStatus, testMessage: asset.testMessage }, asset);
            }
            if (args.action === 'test') {
                if (!args.id || !args.url)
                    throw new Error('automation development test requires id and url');
                const result = await executeAutomationAsset(ctx.service, assets, args.id, args.url, args.inputs, 'draft', {
                    signal: ctx.signal,
                    ...args.authProfile ? { authProfile: args.authProfile } : {},
                    ...args.rulePack ? { rulePack: args.rulePack } : {},
                    session: ctx.session,
                });
                const capped = capJson(result.value, 50_000);
                // Flat on purpose: executionStatus, validationStatus, completedSteps, failedStep and effects sit next to testStatus.
                return withOutcome({
                    action: 'test', assetId: result.asset.id, status: result.asset.status,
                    testStatus: result.asset.testStatus, testMessage: result.asset.testMessage,
                    ...result.execution,
                    result: capped.value, truncated: capped.truncated,
                }, recipeOutcome(result.execution));
            }
            if (args.action === 'convert') {
                if (!args.id)
                    throw new Error('automation development convert requires id');
                const { draft, conversion } = development.convert(args.id, ctx.sessionId);
                return developmentResult('convert', {
                    id: draft.id, status: draft.status, schemaVersion: 2, name: draft.name, revision: draft.revision,
                    sourceAssetId: draft.sourceAssetId, sourceRevision: draft.sourceRevision, steps: draft.recipe?.length ?? 0,
                    pendingDisambiguation: conversion.pendingDisambiguation, notes: conversion.notes,
                }, draft);
            }
            if (args.action !== 'save' || !args.kind || !args.name)
                throw new Error('automation development save requires kind and name');
            const asset = development.save({
                ...args.id ? { id: args.id } : {}, kind: args.kind, name: args.name,
                ...args.description !== undefined ? { description: args.description } : {},
                ...args.domains ? { domains: args.domains } : {}, ...args.tags ? { tags: args.tags } : {},
                ...args.inputNames ? { inputNames: args.inputNames } : {}, ...args.recipe ? { recipe: args.recipe } : {},
                ...args.schemaVersion !== undefined ? { schemaVersion: args.schemaVersion } : {},
                ...args.inputSchema ? { inputSchema: args.inputSchema } : {}, ...args.outputSchema ? { outputSchema: args.outputSchema } : {},
                ...args.postconditions ? { postconditions: args.postconditions } : {}, ...args.requiredCapabilities ? { requiredCapabilities: args.requiredCapabilities } : {},
                ...args.source !== undefined ? { source: args.source } : {},
            }, ctx.sessionId);
            const compact = {
                id: asset.id, kind: asset.kind, status: asset.status, name: asset.name, domains: asset.domains, tags: asset.tags, inputNames: asset.inputNames, revision: asset.revision, testStatus: asset.testStatus,
                ...asset.schemaVersion === 2 ? { schemaVersion: 2, pendingDisambiguation: asset.pendingDisambiguation?.length ?? 0 } : {},
            };
            return developmentResult('save', compact, asset);
        },
    },
    {
        name: 'automation.run',
        group: 'automation',
        summary: 'Run one activated reusable automation by id with declared inputs and a target HTTP(S) URL.',
        notes: 'Search first. Source and recipe internals stay Host-side.',
        params: {
            id: { type: 'string', required: true }, url: { type: 'string', required: true },
            inputs: { type: 'object', additionalProperties: true, description: 'Declared string inputs used by named recipe placeholders.' },
            authProfile: { type: 'string' }, rulePack: { type: 'string' },
        },
        approval: 'asset-run', readOnly: false, mutating: true, concurrencySafe: false, timeoutMs: 120_000, settleMs: RECIPE_SETTLE_MS,
        errors: ['VALIDATION_FAILED', 'OUTCOME_UNKNOWN'],
        examples: [{ args: { id: 'asset-id', url: 'https://example.com/search', inputs: { query: 'dsh' } } }],
        async execute(args, ctx) {
            if (!ctx.assets)
                throw new ActionUnavailableError('automation assets are unavailable');
            const result = await executeAutomationAsset(ctx.service, ctx.assets, args.id, args.url, args.inputs, 'active', {
                signal: ctx.signal,
                ...args.authProfile ? { authProfile: args.authProfile } : {},
                ...args.rulePack ? { rulePack: args.rulePack } : {},
                session: ctx.session,
            });
            const capped = capJson(result.value, DEVELOP_LIMIT);
            return withOutcome({ assetId: result.asset.id, kind: result.asset.kind, ...result.execution, result: capped.value, truncated: capped.truncated }, recipeOutcome(result.execution));
        },
    },
    {
        name: 'automation.run_recipe',
        group: 'automation',
        summary: 'Run an inline Playwright recipe (max 25 named steps) on the current page or a given url.',
        notes: 'Read-only steps (wait, goto, extract, assert, screenshot) run directly; mutating steps are denied in read-only, approved once in standard, and direct in autonomous/unrestricted. Prefer schemaVersion 2 (strict locators, see automation.develop for the step rules).',
        params: {
            url: { type: 'string', description: 'Open this URL first; omit only when target.open already established a page.' },
            authProfile: { type: 'string' },
            rulePack: { type: 'string' },
            waitMs: { type: 'number' },
            steps: { type: 'array', required: true, items: { ref: 'recipeStep' } },
            schemaVersion: { type: 'number', description: '1 (default): steps use selector and take the first match. 2: steps use locator (strict), goto/clear exist, postconditions apply.' },
            allowedDomains: { type: 'array', items: { type: 'string' }, description: 'v2 goto may go to these domains (and stay on the starting origin). Default: the starting origin only.' },
            postconditions: { type: 'array', items: { ref: 'postcondition' }, description: 'v2: what must hold after the steps.' },
        },
        approval: 'recipe', readOnly: true, mutating: true, concurrencySafe: false, timeoutMs: 120_000, settleMs: RECIPE_SETTLE_MS,
        errors: ['VALIDATION_FAILED', 'OUTCOME_UNKNOWN', 'INVALID_RECIPE'],
        examples: [
            { args: { url: 'https://example.com/', steps: [{ type: 'extract', selector: 'main', mode: 'text', limit: 5 }] } },
            { args: { url: 'https://example.com/', schemaVersion: 2, steps: [{ type: 'click', locator: { role: 'link', name: 'More' } }, { type: 'extract', locator: { css: 'main' }, as: 'body' }], postconditions: [{ output: 'body', nonEmpty: true }] }, note: 'v2: strict locators' },
        ],
        async execute(args, ctx) {
            const steps = args.steps;
            const v2 = args.schemaVersion === 2;
            if (args.schemaVersion !== undefined && args.schemaVersion !== 1 && !v2)
                throw new RecipeValidationError('schemaVersion must be 1 or 2');
            if (!v2 && (args.postconditions || args.allowedDomains))
                throw new RecipeValidationError('postconditions and allowedDomains need schemaVersion 2');
            let postconditions;
            try {
                postconditions = v2 && args.postconditions ? normalizePostconditions(args.postconditions, steps) : undefined;
            }
            catch (error) {
                throw new RecipeValidationError(error instanceof Error ? error.message : String(error));
            }
            try {
                const { steps: _legacy, ...result } = await ctx.service.recipe(steps, {
                    signal: ctx.signal,
                    ...args.url ? { url: args.url } : {},
                    ...args.waitMs !== undefined ? { waitMs: args.waitMs } : {},
                    ...args.authProfile ? { authProfile: args.authProfile } : {},
                    ...args.rulePack ? { rulePack: args.rulePack } : {},
                    ...v2 ? { schemaVersion: 2, gotoSameOrigin: true, ...args.allowedDomains ? { allowedDomains: args.allowedDomains } : {}, ...postconditions ? { postconditions } : {} } : {},
                    session: ctx.session,
                });
                const outcome = recipeOutcome(result);
                const where = result.url || args.url;
                // v2 inline recipes are not offered as reuse candidates (the candidate store normalizes v1 selectors only).
                if (where && !v2)
                    ctx.assets?.recordRecipe(where, steps, ctx.sessionId, outcome.ok);
                return withOutcome(result, outcome);
            }
            catch (error) {
                if (args.url && !v2)
                    ctx.assets?.recordRecipe(args.url, steps, ctx.sessionId, false);
                throw error;
            }
        },
    },
];
//# sourceMappingURL=automation.js.map