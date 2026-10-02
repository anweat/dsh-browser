/**
 * The progressive-disclosure views behind `browser_index`.
 *
 * L1 is the group list (root) and one group's actions; L2 is one action's full
 * schema. Only actions usable under the current automationMode are listed;
 * the rest collapse into one line with the reason.
 * @module dsh-browser/actions/index-view
 */
import { ACTIONS, GROUP_SUMMARIES, actionsInGroup, findAction, isActionGroup } from "./registry.js";
import { ACTION_GROUPS } from "./types.js";
import { compactParams, describeParams } from "./schema.js";
import { actionUnavailableReason } from "../freedom.js";
/** The fallback guide shown at the root when no skill service is present (kept under ~300 tokens). */
export const COMPACT_GUIDE = [
    'Guide: (1) automation.search first; if an active asset fits, automation.run it instead of exploring.',
    '(2) Else target.open -> observe.read -> act.* using locators (role+name, label, text) -> observe.read to verify.',
    '(3) act.* change pages. If a submit-like action times out (outcome_unknown), check the result before retrying.',
    '(4) Errors carry code+hint; INVALID_ARGS includes the schema. (5) Repeatable success: automation.develop (save + test a draft); activation is the user\'s.',
].join('\n');
const MAX_LINE = 170;
function approvalNote(action, mode) {
    const asks = {
        none: () => '',
        interaction: m => m === 'standard' ? 'asks' : '',
        install: m => m === 'unrestricted' ? '' : 'asks',
        upload: m => m === 'unrestricted' ? '' : 'asks',
        evaluate: m => m === 'unrestricted' ? '' : 'asks',
        userscript: m => m === 'unrestricted' ? '' : 'asks',
        opencli: m => m === 'unrestricted' ? '' : 'asks',
        recipe: m => m === 'standard' ? 'asks if mutating' : '',
        'asset-run': m => m === 'unrestricted' ? '' : m === 'autonomous' ? 'asks for userscripts' : 'asks',
        'asset-develop': m => m === 'standard' ? 'asks to write' : '',
    };
    return asks[action.approval](mode);
}
function line(action, mode) {
    const note = approvalNote(action, mode);
    const params = compactParams(action.params);
    const head = `${action.name} - ${action.summary}`;
    const tail = ` | ${params || 'no args'}${note ? ` | ${note}` : ''}`;
    const text = head + tail;
    return text.length > MAX_LINE * 2 ? text.slice(0, MAX_LINE * 2 - 1) + '…' : text;
}
function split(actions, env) {
    const usable = [];
    const blocked = [];
    for (const action of actions) {
        const reason = actionUnavailableReason(action, env.mode, env.options, env.enabled);
        if (reason)
            blocked.push({ action, reason });
        else
            usable.push(action);
    }
    return { usable, blocked };
}
function blockedLine(blocked) {
    if (!blocked.length)
        return undefined;
    const reasons = [...new Set(blocked.map(entry => entry.reason))].join('; ');
    return `Unavailable (${reasons}): ${blocked.map(entry => entry.action.name).join(', ')}`;
}
function modeNote(mode) {
    switch (mode) {
        case 'read-only': return 'read-only: page interaction, scripts, and writes are off';
        case 'standard': return 'standard: page interactions and writes ask the user first';
        case 'autonomous': return 'autonomous: interactions and recipes run directly; scripts, uploads, installs ask';
        case 'unrestricted': return 'unrestricted: no approvals (validation and budgets still apply)';
    }
}
export function renderRoot(env) {
    const { usable, blocked } = split(ACTIONS, env);
    const lines = [
        'dsh-browser: run actions with browser_call({action, args}); browser_index({group}) lists a group, browser_index({action}) gives one action\'s schema, browser_index({query}) searches.',
        `mode ${modeNote(env.mode)}`,
    ];
    if (env.runtime?.chromiumInstalled === false)
        lines.push('Chromium is NOT installed: run runtime.install first (large download).');
    if (env.runtime?.opencliEnabled && env.runtime.opencliInstalled === false)
        lines.push('OpenCLI is enabled but not installed.');
    lines.push('Groups:');
    for (const group of ACTION_GROUPS) {
        const count = usable.filter(action => action.group === group).length;
        if (count === 0)
            continue;
        lines.push(`  ${group} (${count}) ${GROUP_SUMMARIES[group]}`);
    }
    lines.push('Reuse first: browser_call({action:"automation.search",args:{query}}) then {action:"automation.run",args:{id,url,inputs?}}.');
    const note = blockedLine(blocked);
    if (note)
        lines.push(note.length > 400 ? `Unavailable: ${blocked.length} actions (${[...new Set(blocked.map(entry => entry.reason))].join('; ')}); browser_index({group}) shows what is usable.` : note);
    lines.push(env.skillAvailable ? 'Load skill "dsh-browser" for workflow and locator guidance.' : COMPACT_GUIDE);
    return lines.join('\n');
}
export function renderGroup(group, env) {
    if (!isActionGroup(group))
        return `Unknown group "${group}". Groups: ${ACTION_GROUPS.join(', ')}.`;
    const { usable, blocked } = split(actionsInGroup(group), env);
    const lines = [`${group} - ${GROUP_SUMMARIES[group]}`, ...usable.map(action => line(action, env.mode))];
    const note = blockedLine(blocked);
    if (note)
        lines.push(note);
    return lines.join('\n');
}
function exampleLine(action) {
    return (action.examples ?? []).slice(0, 2).map(example => `example: browser_call(${JSON.stringify({ action: action.name, args: example.args })})${example.note ? ` // ${example.note}` : ''}`);
}
export function renderAction(name, env) {
    const action = findAction(name);
    if (!action) {
        if (isActionGroup(name))
            return renderGroup(name, env);
        const hits = searchActions(name, env).slice(0, 5);
        return `Unknown action "${name}".${hits.length ? ' Similar: ' + hits.map(hit => hit.name).join(', ') + '.' : ''} browser_index() lists the groups.`;
    }
    const reason = actionUnavailableReason(action, env.mode, env.options, env.enabled);
    const note = approvalNote(action, env.mode);
    const lines = [
        `${action.name} - ${action.summary}`,
        `group ${action.group} | ${action.mutating ? 'changes state' : 'read/observe'} | ${reason ? `UNAVAILABLE: ${reason}` : note ? `approval: ${note}` : 'no approval needed'}`,
        ...action.notes ? [action.notes] : [],
        'args:',
        ...describeParams(action.params),
        ...exampleLine(action),
        `errors: INVALID_ARGS, TARGET_CLOSED, DEADLINE, CANCELLED${action.group === 'act' ? ', LOCATOR_NOT_FOUND, NOT_ACTIONABLE' : ''}${action.errors?.length ? ', ' + action.errors.join(', ') : ''}${action.mutating ? ' (a DEADLINE on this action means the outcome is unknown: verify before retrying)' : ''}`,
    ];
    return lines.join('\n');
}
function score(action, terms) {
    const name = action.name.toLowerCase();
    const summary = action.summary.toLowerCase();
    const params = Object.keys(action.params).join(' ').toLowerCase();
    let total = 0;
    for (const term of terms) {
        if (name === term)
            total += 10;
        else if (name.includes(term))
            total += 5;
        if (summary.includes(term))
            total += 2;
        if (action.group === term)
            total += 3;
        if (params.includes(term))
            total += 1;
    }
    return total;
}
export function searchActions(query, env) {
    const terms = query.toLowerCase().split(/[^a-z0-9_.]+/).filter(Boolean);
    if (!terms.length)
        return [];
    const { usable } = split(ACTIONS, env);
    return usable.map(action => ({ action, score: score(action, terms) })).filter(entry => entry.score > 0)
        .sort((a, b) => b.score - a.score || a.action.name.localeCompare(b.action.name)).slice(0, 8).map(entry => entry.action);
}
export function renderSearch(query, env) {
    const hits = searchActions(query, env);
    if (!hits.length)
        return `No usable action matches "${query}". browser_index() lists the groups.`;
    return [`${hits.length} match${hits.length === 1 ? '' : 'es'} for "${query}":`, ...hits.map(action => line(action, env.mode))].join('\n');
}
/** Resolve a `browser_index` call to text. `action` wins over `group`, which wins over `query`. */
export function renderIndex(args, env) {
    if (args.action)
        return { level: 'action', text: renderAction(args.action, env) };
    if (args.group)
        return { level: 'group', text: renderGroup(args.group, env) };
    if (args.query)
        return { level: 'search', text: renderSearch(args.query, env) };
    return { level: 'root', text: renderRoot(env) };
}
//# sourceMappingURL=index-view.js.map