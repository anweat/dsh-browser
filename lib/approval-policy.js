/** Approval classification for multi-action and arbitrary-code browser tools. */
import { recipeNeedsApproval } from "./automation.js";
import { validateUserscript } from "./scripts.js";
import { isBrowserToolExposed } from "./freedom.js";
const DIRECT_INTERACTIONS = new Set(['browser_click', 'browser_type', 'browser_press', 'browser_select', 'browser_check', 'browser_hover', 'browser_scroll']);
const WEB_LOCAL_MUTATIONS = new Set(['web_cache_clear']);
export function browserPolicyDecision(name, args, mode = 'standard') {
    if (!isBrowserToolExposed(name, mode) && name.startsWith('browser_')) {
        return { kind: 'deny', reason: `Browser tool ${name} is disabled by automationMode=${mode}` };
    }
    if (DIRECT_INTERACTIONS.has(name)) {
        if (mode === 'read-only')
            return { kind: 'deny', reason: `Page interaction is disabled by automationMode=${mode}` };
        if (mode === 'standard')
            return { kind: 'ask', reason: 'Run a direct Playwright page interaction: ' + name };
    }
    if (name === 'browser_install') {
        if (mode === 'read-only')
            return { kind: 'deny', reason: `Browser installation is disabled by automationMode=${mode}` };
        if (mode === 'unrestricted')
            return { kind: 'allow' };
        return { kind: 'ask', reason: 'Install Playwright Chromium into the shared browser cache' };
    }
    if (name === 'browser_set_files') {
        const files = Array.isArray(args?.files)
            ? args.files.filter(value => typeof value === 'string')
            : [];
        if (files.length === 0)
            return { kind: 'deny', reason: 'browser_set_files requires one or more absolute file paths' };
        if (mode === 'read-only')
            return { kind: 'deny', reason: `Local file upload is disabled by automationMode=${mode}` };
        if (mode === 'unrestricted')
            return { kind: 'allow' };
        return { kind: 'ask', reason: 'Read local files and expose them to the current website upload control: ' + files.slice(0, 5).join(', ') };
    }
    if (name === 'browser_evaluate') {
        const expression = args?.expression;
        if (typeof expression !== 'string' || !expression.trim())
            return { kind: 'deny', reason: 'browser_evaluate requires a JavaScript expression' };
        if (expression.length > 20_000)
            return { kind: 'deny', reason: 'browser_evaluate expression exceeds 20,000 characters' };
        if (mode === 'read-only')
            return { kind: 'deny', reason: `Page JavaScript execution is disabled by automationMode=${mode}` };
        if (mode === 'unrestricted')
            return { kind: 'allow' };
        return { kind: 'ask', reason: 'Run JavaScript with the current page origin and login state; it may access page storage, non-HttpOnly cookies, and browser-permitted network APIs' };
    }
    if (name === 'browser_userscript_run') {
        const input = args;
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
            reason: `Run external userscript "${validation.metadata.name}" (${validation.sha256.slice(0, 12)}) on ${host}; capabilities: ${validation.capabilities.join(', ')}`,
        };
    }
    if (name === 'browser_opencli_run') {
        const input = args;
        const argv = Array.isArray(input.args) ? input.args.filter(value => typeof value === 'string') : [];
        if (mode === 'read-only')
            return { kind: 'deny', reason: `General OpenCLI commands are disabled by automationMode=${mode}` };
        if (mode === 'unrestricted')
            return { kind: 'allow' };
        return { kind: 'ask', reason: 'Run a general OpenCLI command with the logged-in Chrome profile: ' + (argv.slice(0, 3).join(' ') || '(empty)') };
    }
    if (name === 'browser_recipe_run') {
        const input = args;
        const steps = Array.isArray(input.steps) ? input.steps : [];
        if (recipeNeedsApproval(steps)) {
            const actions = [...new Set(steps.map(step => step.type).filter(type => !['wait', 'extract', 'assert', 'screenshot'].includes(type)))];
            if (mode === 'read-only')
                return { kind: 'deny', reason: `Mutating recipes are disabled by automationMode=${mode}: ` + actions.join(', ') };
            if (mode === 'autonomous' || mode === 'unrestricted')
                return { kind: 'allow' };
            return { kind: 'ask', reason: 'Run a multi-step Playwright recipe with page mutations: ' + actions.join(', ') };
        }
    }
    if (name === 'browser_automation_run') {
        if (mode === 'read-only')
            return { kind: 'deny', reason: `Reusable automation execution is disabled by automationMode=${mode}` };
        if (mode === 'autonomous' || mode === 'unrestricted')
            return { kind: 'allow' };
        return { kind: 'ask', reason: 'Run an active reusable browser automation asset' };
    }
    if (name === 'browser_automation_develop') {
        const action = String(args?.action ?? '');
        if (['get', 'validate'].includes(action))
            return { kind: 'allow' };
        if (mode === 'read-only')
            return { kind: 'deny', reason: `Automation draft writes are disabled by automationMode=${mode}` };
        if (action === 'test' && mode !== 'unrestricted')
            return { kind: 'ask', reason: 'Replay a reusable automation draft in a real browser context' };
        if (mode === 'standard')
            return { kind: 'ask', reason: 'Save a bounded local reusable automation draft' };
        return { kind: 'allow' };
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
//# sourceMappingURL=approval-policy.js.map