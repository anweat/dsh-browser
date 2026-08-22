/** Public automation-freedom contract and tool exposure matrix. */
export declare const AUTOMATION_MODES: readonly ["read-only", "standard", "autonomous", "unrestricted"];
export type AutomationMode = typeof AUTOMATION_MODES[number];
export declare const ALL_BROWSER_TOOL_NAMES: readonly ["browser_open", "browser_click", "browser_type", "browser_scroll", "browser_read", "browser_screenshot", "browser_close", "browser_status", "browser_install", "browser_script_catalog", "browser_script_validate", "browser_script_run_builtin", "browser_userscript_run", "browser_recipe_run", "browser_opencli_status", "browser_opencli_run"];
export type BrowserToolName = typeof ALL_BROWSER_TOOL_NAMES[number];
export declare function resolveAutomationMode(value: unknown): AutomationMode;
export declare function isBrowserToolExposed(name: string, mode: AutomationMode): name is BrowserToolName;
export declare function browserToolsForMode(mode: AutomationMode): BrowserToolName[];
