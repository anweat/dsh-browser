/**
 * Maps a model-visible tool call to the action it will run, so the Host
 * approval hook can judge `browser_call` and flat tools by action rather than
 * by tool name.
 * @module dsh-browser/actions/surface
 */
import { CALL_TOOL, INDEX_TOOL, findAction, findActionByFlatTool } from "./registry.js";
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
//# sourceMappingURL=surface.js.map