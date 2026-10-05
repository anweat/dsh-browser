/**
 * Maps a model-visible tool call to the action it will run, so the Host
 * approval hook can judge `browser_call` and flat tools by action rather than
 * by tool name.
 * @module dsh-browser/actions/surface
 */
import { CALL_TOOL, INDEX_TOOL, findAction, findActionByFlatTool, validateActionArgs } from "./registry.js";
export function resolveBrowserCall(toolName, rawArgs) {
    if (toolName === INDEX_TOOL)
        return { kind: 'index' };
    if (toolName === CALL_TOOL) {
        const input = (rawArgs && typeof rawArgs === 'object' ? rawArgs : {});
        return findAction(input.action) ? { kind: 'action', action: input.action, args: input.args ?? {} } : { kind: 'unresolved' };
    }
    const flat = findActionByFlatTool(toolName);
    return flat ? { kind: 'action', action: flat.name, args: rawArgs ?? {} } : undefined;
}
/**
 * Whether `runAction` would refuse these arguments for their shape (`INVALID_ARGS`) before running anything.
 * It is the very check `runAction` makes (`validateActionArgs`), so the approval hook can leave such a call
 * unasked: asking about a call that cannot run only teaches the user to click through prompts. False for a
 * name that is not an action.
 */
export function argsRejectedByExecutor(actionName, args) {
    const action = findAction(actionName);
    return action !== undefined && !validateActionArgs(action, args).ok;
}
//# sourceMappingURL=surface.js.map