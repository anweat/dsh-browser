/** Public automation-freedom contract and tool exposure matrix. */
export const AUTOMATION_MODES = ['read-only', 'standard', 'autonomous', 'unrestricted'];
export const ALL_BROWSER_TOOL_NAMES = [
    'browser_open',
    'browser_click',
    'browser_type',
    'browser_scroll',
    'browser_read',
    'browser_screenshot',
    'browser_close',
    'browser_status',
    'browser_install',
    'browser_script_catalog',
    'browser_script_validate',
    'browser_script_run_builtin',
    'browser_userscript_run',
    'browser_recipe_run',
    'browser_automation_search',
    'browser_automation_develop',
    'browser_automation_run',
    'browser_opencli_status',
    'browser_opencli_catalog',
    'browser_opencli_run',
    'browser_crawl',
];
const READ_ONLY_TOOL_NAMES = new Set([
    'browser_open',
    'browser_read',
    'browser_screenshot',
    'browser_close',
    'browser_status',
    'browser_script_catalog',
    'browser_script_validate',
    'browser_script_run_builtin',
    'browser_recipe_run',
    'browser_automation_search',
    'browser_automation_develop',
    'browser_opencli_status',
    'browser_opencli_catalog',
    'browser_crawl',
]);
export function resolveAutomationMode(value) {
    const mode = value ?? 'standard';
    if (typeof mode !== 'string' || !AUTOMATION_MODES.includes(mode)) {
        throw new Error('automationMode must be one of: ' + AUTOMATION_MODES.join(', '));
    }
    return mode;
}
export function isBrowserToolExposed(name, mode) {
    if (!ALL_BROWSER_TOOL_NAMES.includes(name))
        return false;
    return mode !== 'read-only' || READ_ONLY_TOOL_NAMES.has(name);
}
export function browserToolsForMode(mode) {
    return ALL_BROWSER_TOOL_NAMES.filter(name => isBrowserToolExposed(name, mode));
}
export function configuredBrowserTools(mode, options, enabled = true) {
    if (!enabled)
        return [];
    return browserToolsForMode(mode).filter(name => name !== 'browser_automation_develop' || options.modelDevelopmentEnabled);
}
//# sourceMappingURL=freedom.js.map