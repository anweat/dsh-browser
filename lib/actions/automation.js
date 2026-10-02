/** `automation` group: reusable assets and inline recipes. @module dsh-browser/actions/automation */
import { ActionUnavailableError, withOutcome } from "./types.js";
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
        summary: 'Get, save, validate, or replay one automation draft. Never activates assets.',
        notes: 'Search first. Full recipe/source is returned only for action=get with an exact id. `action` here is this action\'s own parameter (get|save|validate|test).',
        params: {
            action: { type: 'string', required: true, enum: ['get', 'save', 'validate', 'test'] },
            id: { type: 'string', description: 'Exact asset id for get, update, validate, or test.' },
            kind: { type: 'string', enum: ['recipe', 'userscript'], description: 'Required for save.' },
            name: { type: 'string', description: 'Required for save.' },
            description: { type: 'string' },
            domains: { type: 'array', items: { type: 'string' } },
            tags: { type: 'array', items: { type: 'string' }, description: 'Explicit retrieval keywords, capped at 20.' },
            inputNames: { type: 'array', items: { type: 'string' }, description: 'Declared UserScript __DSH_INPUTS__ keys. Recipe placeholders are inferred.' },
            recipe: { type: 'array', items: { ref: 'recipeStep' }, description: '1-25 declarative Playwright steps.' },
            source: { type: 'string', description: 'Complete UserScript with @match and @grant none.' },
            url: { type: 'string', description: 'Required for test; must match the draft domain and UserScript @match.' },
            inputs: { type: 'object', additionalProperties: true, description: 'Declared runtime inputs for test.' },
            authProfile: { type: 'string' },
            rulePack: { type: 'string' },
        },
        approval: 'asset-develop', readOnly: true, mutating: false, concurrencySafe: false, timeoutMs: 30_000, settleMs: RECIPE_SETTLE_MS,
        errors: ['VALIDATION_FAILED', 'OUTCOME_UNKNOWN'],
        examples: [{ args: { action: 'get', id: 'asset-id' } }],
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
            if (args.action !== 'save' || !args.kind || !args.name)
                throw new Error('automation development save requires kind and name');
            const asset = development.save({
                ...args.id ? { id: args.id } : {}, kind: args.kind, name: args.name,
                ...args.description !== undefined ? { description: args.description } : {},
                ...args.domains ? { domains: args.domains } : {}, ...args.tags ? { tags: args.tags } : {},
                ...args.inputNames ? { inputNames: args.inputNames } : {}, ...args.recipe ? { recipe: args.recipe } : {},
                ...args.source !== undefined ? { source: args.source } : {},
            }, ctx.sessionId);
            const compact = { id: asset.id, kind: asset.kind, status: asset.status, name: asset.name, domains: asset.domains, tags: asset.tags, inputNames: asset.inputNames, revision: asset.revision, testStatus: asset.testStatus };
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
        notes: 'Read-only steps (wait, extract, assert, screenshot) run directly; mutating steps are denied in read-only, approved once in standard, and direct in autonomous/unrestricted.',
        params: {
            url: { type: 'string', description: 'Open this URL first; omit only when target.open already established a page.' },
            authProfile: { type: 'string' },
            rulePack: { type: 'string' },
            waitMs: { type: 'number' },
            steps: { type: 'array', required: true, items: { ref: 'recipeStep' } },
        },
        approval: 'recipe', readOnly: true, mutating: true, concurrencySafe: false, timeoutMs: 120_000, settleMs: RECIPE_SETTLE_MS,
        errors: ['VALIDATION_FAILED', 'OUTCOME_UNKNOWN', 'INVALID_RECIPE'],
        examples: [{ args: { url: 'https://example.com/', steps: [{ type: 'extract', selector: 'main', mode: 'text', limit: 5 }] } }],
        async execute(args, ctx) {
            const steps = args.steps;
            try {
                const { steps: _legacy, ...result } = await ctx.service.recipe(steps, {
                    signal: ctx.signal,
                    ...args.url ? { url: args.url } : {},
                    ...args.waitMs !== undefined ? { waitMs: args.waitMs } : {},
                    ...args.authProfile ? { authProfile: args.authProfile } : {},
                    ...args.rulePack ? { rulePack: args.rulePack } : {},
                    session: ctx.session,
                });
                const outcome = recipeOutcome(result);
                const where = result.url || args.url;
                if (where)
                    ctx.assets?.recordRecipe(where, steps, ctx.sessionId, outcome.ok);
                return withOutcome(result, outcome);
            }
            catch (error) {
                if (args.url)
                    ctx.assets?.recordRecipe(args.url, steps, ctx.sessionId, false);
                throw error;
            }
        },
    },
];
//# sourceMappingURL=automation.js.map