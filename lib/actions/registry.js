/**
 * The action registry: the single definition of every model-visible browser
 * capability. Tool surfaces, approval policy, and exposure rules are all
 * derived from this list.
 * @module dsh-browser/actions/registry
 */
import { ACTION_GROUPS } from "./types.js";
import { RUNTIME_ACTIONS } from "./runtime.js";
import { TARGET_ACTIONS } from "./target.js";
import { OBSERVE_ACTIONS } from "./observe.js";
import { ACT_ACTIONS } from "./act.js";
import { INSPECT_ACTIONS } from "./inspect.js";
import { SCRIPT_ACTIONS } from "./script.js";
import { AUTOMATION_ACTIONS } from "./automation.js";
import { CRAWL_ACTIONS } from "./crawl.js";
import { OPENCLI_ACTIONS } from "./opencli.js";
export const ACTIONS = [
    ...RUNTIME_ACTIONS, ...TARGET_ACTIONS, ...OBSERVE_ACTIONS, ...ACT_ACTIONS, ...INSPECT_ACTIONS,
    ...SCRIPT_ACTIONS, ...AUTOMATION_ACTIONS, ...CRAWL_ACTIONS, ...OPENCLI_ACTIONS,
];
const BY_NAME = new Map(ACTIONS.map(action => [action.name, action]));
export const GROUP_SUMMARIES = {
    runtime: 'runtime status and Chromium install',
    target: 'open / close / list this session\'s page',
    observe: 'read page text, screenshots',
    act: 'click, fill, press, select, check, hover, scroll, upload, wait',
    inspect: 'captured console and failed-request records',
    script: 'page JavaScript, built-in scripts, userscripts',
    automation: 'search/run reusable assets, develop drafts, inline recipes',
    crawl: 'bounded multi-page crawl',
    opencli: 'bundled OpenCLI site adapters',
};
export function isActionGroup(value) {
    return typeof value === 'string' && ACTION_GROUPS.includes(value);
}
export function findAction(name) {
    return typeof name === 'string' ? BY_NAME.get(name) : undefined;
}
export function actionsInGroup(group) {
    return ACTIONS.filter(action => action.group === group);
}
/** Tool name for an action on the flat surface: `browser_<group>_<action>` (`browser_crawl` for crawl.crawl). */
export function flatToolName(action) {
    const [group, name] = action.name.split('.');
    return group === name ? `browser_${group}` : `browser_${group}_${name}`;
}
const BY_FLAT_NAME = new Map(ACTIONS.map(action => [flatToolName(action), action]));
export function findActionByFlatTool(toolName) {
    return BY_FLAT_NAME.get(toolName);
}
/** The two tools of the indexed surface. */
export const INDEX_TOOL = 'browser_index';
export const CALL_TOOL = 'browser_call';
//# sourceMappingURL=registry.js.map