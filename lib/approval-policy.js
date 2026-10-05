/**
 * Approval classification, per action.
 *
 * The Host hook resolves a model tool call (`browser_call`, or a flat
 * per-action tool) to an action name plus its arguments and asks this module
 * for a decision. Each action carries an approval class in the registry; the
 * rules below interpret that class for the current automationMode. Reasons
 * name the action and its key arguments, so the user sees `act.click #submit`
 * rather than a generic dispatcher tool.
 * @module dsh-browser/approval-policy
 */
import { READ_ONLY_ACTIONS, recipeNeedsApproval } from "./automation.js";
import { validateUserscript } from "./scripts.js";
import { isBrowserActionExposed } from "./freedom.js";
import { findAction } from "./actions/registry.js";
import { argsRejectedByExecutor } from "./actions/surface.js";
const WEB_LOCAL_MUTATIONS = new Set(['web_cache_clear']);
const clip = (text, max = 120) => text.length > max ? text.slice(0, max) + '…' : text;
/**
 * `"Host check: docs search" r1 (5fdc912d)`: the name (control characters and line breaks flattened, cut to 60 characters,
 * quoted so it reads as data), the revision, and the first 8 characters of the id. The name is whatever a model saved, so
 * it is never trusted to be one line.
 */
export function assetLabel(asset) {
    const name = clip(asset.name.replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]+/g, ' ').replace(/\s+/g, ' ').trim(), 60);
    return `${JSON.stringify(name)} r${asset.revision} (${asset.id.slice(0, 8)})`;
}
/** Short, human-readable description of an action's target for approval prompts. */
function targetLabel(args) {
    const input = (args && typeof args === 'object' ? args : {});
    if (typeof input.selector === 'string')
        return clip(input.selector);
    const locator = input.locator;
    if (locator && typeof locator === 'object') {
        const parts = ['role', 'name', 'text', 'label', 'testId', 'selector', 'css'].filter(key => typeof locator[key] === 'string').map(key => `${key}=${JSON.stringify(clip(String(locator[key]), 60))}`);
        if (parts.length)
            return parts.join(' ');
    }
    return '(page)';
}
/** `act.fill #q (4 chars)` style summary of a direct interaction. */
function interactionLabel(name, args) {
    const input = (args && typeof args === 'object' ? args : {});
    const extras = [];
    if ((name === 'act.fill' || name === 'act.type') && typeof input.text === 'string')
        extras.push(`${input.text.length} chars`);
    if (name === 'act.press' && typeof input.key === 'string')
        extras.push(`key ${clip(input.key, 40)}`);
    if (name === 'act.select' && Array.isArray(input.values))
        extras.push('values ' + clip(input.values.map(String).join(',')));
    if (name === 'act.check')
        extras.push(input.checked === false ? 'uncheck' : 'check');
    if (name === 'act.scroll')
        extras.push(`deltaY ${typeof input.deltaY === 'number' ? input.deltaY : 2000}`);
    return `${name} ${targetLabel(args)}${extras.length ? ' (' + extras.join('; ') + ')' : ''}`;
}
/**
 * The one rule for replaying recipe steps: read-only steps run directly; mutating steps are denied in
 * read-only, asked in standard, and free in autonomous and unrestricted. `automation.run_recipe` applies
 * it to the steps in the call, and `automation.develop` test applies it to the steps of the draft.
 */
export function recipeStepsDecision(name, steps, mode) {
    if (!recipeNeedsApproval(steps))
        return { kind: 'allow' };
    const actions = [...new Set(steps.map(step => step.type).filter(type => !READ_ONLY_ACTIONS.has(type)))];
    if (mode === 'read-only')
        return { kind: 'deny', reason: `Mutating recipes are disabled by automationMode=${mode}: ` + actions.join(', ') };
    if (mode === 'autonomous' || mode === 'unrestricted')
        return { kind: 'allow' };
    return { kind: 'ask', reason: `${name}: Run a multi-step Playwright recipe with page mutations: ` + actions.join(', ') };
}
/**
 * Decide whether a call may run.
 * @param name - an action name (`act.click`) or one of the WebSearch tool names this policy also guards.
 * @param args - the action's own arguments (never the `browser_call` wrapper).
 * @param mode - the configured automationMode.
 * @param assetKind - for `automation.run` and `automation.develop` test, the kind of the asset about to run.
 * @param draftSteps - for `automation.develop` test of a recipe, the steps the draft would replay.
 * @param asset - for the same two, the asset itself, so the approval prompt names it instead of showing a bare id.
 */
export function browserPolicyDecision(name, args, mode = 'standard', assetKind, draftSteps, asset) {
    const action = findAction(name);
    if (!action && (name.startsWith('browser_') || /^[a-z]+\.[a-z_]+$/.test(name))) {
        return { kind: 'deny', reason: `Unknown browser action ${name}; browser tools are reached through browser_index / browser_call` };
    }
    if (action) {
        if (!isBrowserActionExposed(name, mode, args ?? {}))
            return { kind: 'deny', reason: `Browser action ${name} is disabled by automationMode=${mode}` };
        switch (action.approval) {
            case 'interaction': {
                if (mode === 'read-only')
                    return { kind: 'deny', reason: `Page interaction is disabled by automationMode=${mode}` };
                if (mode === 'standard')
                    return { kind: 'ask', reason: 'Run a direct Playwright page interaction: ' + interactionLabel(name, args) };
                return { kind: 'allow' };
            }
            case 'install': {
                if (mode === 'read-only')
                    return { kind: 'deny', reason: `Browser installation is disabled by automationMode=${mode}` };
                if (mode === 'unrestricted')
                    return { kind: 'allow' };
                return { kind: 'ask', reason: `${name}: Install Playwright Chromium into the shared browser cache` };
            }
            case 'upload': {
                const files = Array.isArray(args?.files)
                    ? args.files.filter(value => typeof value === 'string')
                    : [];
                if (files.length === 0)
                    return { kind: 'deny', reason: `${name} requires one or more absolute file paths` };
                if (mode === 'read-only')
                    return { kind: 'deny', reason: `Local file upload is disabled by automationMode=${mode}` };
                if (mode === 'unrestricted')
                    return { kind: 'allow' };
                return { kind: 'ask', reason: `${name} ${targetLabel(args)}: Read local files and expose them to the current website upload control: ` + files.slice(0, 5).join(', ') };
            }
            case 'evaluate': {
                const expression = args?.expression;
                if (typeof expression !== 'string' || !expression.trim())
                    return { kind: 'deny', reason: `${name} requires a JavaScript expression` };
                if (expression.length > 20_000)
                    return { kind: 'deny', reason: `${name} expression exceeds 20,000 characters` };
                if (mode === 'read-only')
                    return { kind: 'deny', reason: `Page JavaScript execution is disabled by automationMode=${mode}` };
                if (mode === 'unrestricted')
                    return { kind: 'allow' };
                return { kind: 'ask', reason: `${name} \`${clip(expression.replace(/\s+/g, ' '), 100)}\`: Run JavaScript with the current page origin and login state; it may access page storage, non-HttpOnly cookies, and browser-permitted network APIs` };
            }
            case 'userscript': {
                const input = (args ?? {});
                if (typeof input.source !== 'string' || typeof input.url !== 'string')
                    return { kind: 'deny', reason: 'external userscript requires source and URL' };
                const validation = validateUserscript(input.source, input.url);
                if (!validation.valid)
                    return { kind: 'deny', reason: 'invalid external userscript: ' + validation.errors.join('; ') };
                if (mode === 'read-only')
                    return { kind: 'deny', reason: `External userscripts are disabled by automationMode=${mode}` };
                if (mode === 'unrestricted')
                    return { kind: 'allow' };
                const host = new URL(input.url).hostname;
                return {
                    kind: 'ask',
                    reason: `${name}: Run external userscript "${validation.metadata.name}" (${validation.sha256.slice(0, 12)}) on ${host}; capabilities: ${validation.capabilities.join(', ')}`,
                };
            }
            case 'opencli': {
                const input = (args ?? {});
                const argv = Array.isArray(input.args) ? input.args.filter(value => typeof value === 'string') : [];
                if (mode === 'read-only')
                    return { kind: 'deny', reason: `General OpenCLI commands are disabled by automationMode=${mode}` };
                if (mode === 'unrestricted')
                    return { kind: 'allow' };
                return { kind: 'ask', reason: `${name}: Run a general OpenCLI command with the logged-in Chrome profile: ` + (argv.slice(0, 3).join(' ') || '(empty)') };
            }
            case 'recipe': {
                const input = (args ?? {});
                return recipeStepsDecision(name, Array.isArray(input.steps) ? input.steps : [], mode);
            }
            case 'asset-run': {
                const id = args?.id;
                const label = asset ? ` ${assetLabel(asset)}` : typeof id === 'string' ? ` ${clip(id.replace(/\s+/g, ' '), 60)}` : '';
                if (mode === 'read-only')
                    return { kind: 'deny', reason: `Reusable automation execution is disabled by automationMode=${mode}` };
                if (mode === 'unrestricted' || (mode === 'autonomous' && assetKind === 'recipe'))
                    return { kind: 'allow' };
                return { kind: 'ask', reason: `${name}${label}: Run an active reusable browser automation asset` };
            }
            case 'asset-develop': {
                const develop = String(args?.action ?? '');
                if (['get', 'validate'].includes(develop))
                    return { kind: 'allow' };
                if (mode === 'read-only')
                    return { kind: 'deny', reason: `Automation draft writes are disabled by automationMode=${mode}` };
                if (develop === 'test') {
                    if (mode === 'unrestricted')
                        return { kind: 'allow' };
                    // Autonomous: a recipe draft is replayed under exactly the rule automation.run_recipe applies to the same steps.
                    // A UserScript draft, or a draft we cannot look up, still asks.
                    if (mode === 'autonomous' && assetKind === 'recipe' && draftSteps) {
                        const byRecipeRule = recipeStepsDecision(name + ' test', draftSteps, mode);
                        if (byRecipeRule.kind === 'allow')
                            return byRecipeRule;
                    }
                    return { kind: 'ask', reason: `${name} test${asset ? ' ' + assetLabel(asset) : ''}: Replay a reusable automation draft in a real browser context` };
                }
                if (mode === 'standard')
                    return { kind: 'ask', reason: `${name} ${develop || '(unspecified)'}: Save a bounded local reusable automation draft` };
                return { kind: 'allow' };
            }
            case 'none':
                return { kind: 'allow' };
        }
    }
    if (name === 'web_deps' && args?.action === 'install') {
        if (mode === 'read-only')
            return { kind: 'deny', reason: `Dependency installation is disabled by automationMode=${mode}` };
        if (mode === 'unrestricted')
            return { kind: 'allow' };
        return { kind: 'ask', reason: 'Install an external Web Search Pro backend dependency' };
    }
    const webRuleAction = name === 'web_rule' ? args?.action : undefined;
    if (WEB_LOCAL_MUTATIONS.has(name) || (name === 'web_rule' && ['upsert', 'remove', 'import'].includes(String(webRuleAction)))) {
        if (mode === 'read-only')
            return { kind: 'deny', reason: `Web Search Pro mutations are disabled by automationMode=${mode}` };
        if (mode === 'standard')
            return { kind: 'ask', reason: 'Modify Web Search Pro local state: ' + name };
    }
    return { kind: 'allow' };
}
/**
 * The decision the Host hook returns for a resolved browser action, in this order:
 *
 * 1. An action the automationMode disables stays denied (`browserPolicyDecision` says so).
 * 2. Arguments `runAction` would refuse for their shape are let through unasked: the executor validates them
 *    again with the same check and returns `INVALID_ARGS` with the schema, and runs nothing.
 * 3. Otherwise the approval rules of `browserPolicyDecision` apply. The rules that read the arguments themselves
 *    (upload paths, evaluate expression, userscript source) therefore only see arguments that passed the schema.
 */
export function browserCallDecision(...params) {
    const [name, args, mode = 'standard'] = params;
    if (findAction(name) && isBrowserActionExposed(name, mode, args ?? {}) && argsRejectedByExecutor(name, args))
        return { kind: 'allow' };
    return browserPolicyDecision(...params);
}
//# sourceMappingURL=approval-policy.js.map