/** Approval classification for multi-action and arbitrary-code browser tools. */
import { recipeNeedsApproval } from "./automation.js";
import { validateUserscript } from "./scripts.js";
export function browserPolicyDecision(name, args) {
    if (name === 'browser_userscript_run') {
        const input = args;
        if (typeof input.source !== 'string' || typeof input.url !== 'string')
            return { kind: 'deny', reason: 'external userscript requires source and URL' };
        const validation = validateUserscript(input.source, input.url);
        if (!validation.valid)
            return { kind: 'deny', reason: 'invalid external userscript: ' + validation.errors.join('; ') };
        const host = new URL(input.url).hostname;
        return {
            kind: 'ask',
            reason: `Run external userscript "${validation.metadata.name}" (${validation.sha256.slice(0, 12)}) on ${host}; capabilities: ${validation.capabilities.join(', ')}`,
        };
    }
    if (name === 'browser_opencli_run') {
        const input = args;
        const argv = Array.isArray(input.args) ? input.args.filter(value => typeof value === 'string') : [];
        return { kind: 'ask', reason: 'Run a general OpenCLI command with the logged-in Chrome profile: ' + (argv.slice(0, 3).join(' ') || '(empty)') };
    }
    if (name === 'browser_recipe_run') {
        const input = args;
        const steps = Array.isArray(input.steps) ? input.steps : [];
        if (recipeNeedsApproval(steps)) {
            const actions = [...new Set(steps.map(step => step.type).filter(type => !['wait', 'extract', 'assert', 'screenshot'].includes(type)))];
            return { kind: 'ask', reason: 'Run a multi-step Playwright recipe with page mutations: ' + actions.join(', ') };
        }
    }
    return { kind: 'allow' };
}
//# sourceMappingURL=approval-policy.js.map