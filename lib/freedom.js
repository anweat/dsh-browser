/** Public automation-freedom contract and action exposure matrix. */
import { ACTIONS, CALL_TOOL, INDEX_TOOL, findAction, flatToolName } from "./actions/registry.js";
export const AUTOMATION_MODES = ['read-only', 'standard', 'autonomous', 'unrestricted'];
export const TOOL_SURFACES = ['indexed', 'flat'];
/** Every browser action name (`group.action`), straight from the registry. */
export const ALL_BROWSER_ACTION_NAMES = ACTIONS.map(action => action.name);
export function resolveAutomationMode(value) {
    const mode = value ?? 'standard';
    if (typeof mode !== 'string' || !AUTOMATION_MODES.includes(mode)) {
        throw new Error('automationMode must be one of: ' + AUTOMATION_MODES.join(', '));
    }
    return mode;
}
export function resolveToolSurface(value) {
    const surface = value ?? 'indexed';
    if (typeof surface !== 'string' || !TOOL_SURFACES.includes(surface)) {
        throw new Error('toolSurface must be one of: ' + TOOL_SURFACES.join(', '));
    }
    return surface;
}
/** Whether an action name is a known browser action allowed under the mode. */
export function isBrowserActionExposed(name, mode) {
    const action = findAction(name);
    if (!action)
        return false;
    return mode !== 'read-only' || action.readOnly;
}
export function browserActionsForMode(mode) {
    return ALL_BROWSER_ACTION_NAMES.filter(name => isBrowserActionExposed(name, mode));
}
/** Actions the model may use under this configuration. */
export function configuredBrowserActions(mode, options, enabled = true) {
    if (!enabled)
        return [];
    return browserActionsForMode(mode).filter(name => name !== 'automation.develop' || options.modelDevelopmentEnabled);
}
/** Why an action cannot run now, or undefined when it can. */
export function actionUnavailableReason(action, mode, options, enabled = true) {
    if (!enabled)
        return 'browser service is disabled (enabled=false)';
    if (mode === 'read-only' && !action.readOnly)
        return `disabled by automationMode=${mode}`;
    if (action.name === 'automation.develop' && !options.modelDevelopmentEnabled)
        return 'disabled by automationAssets.modelDevelopmentEnabled=false';
    return undefined;
}
/** Tool names the plugin registers for a surface (empty when the service is disabled). */
export function configuredBrowserTools(mode, options, enabled = true, surface = 'indexed') {
    if (!enabled)
        return [];
    if (surface === 'indexed')
        return [INDEX_TOOL, CALL_TOOL];
    const exposed = new Set(configuredBrowserActions(mode, options, enabled));
    return ACTIONS.filter(action => exposed.has(action.name)).map(flatToolName);
}
//# sourceMappingURL=freedom.js.map