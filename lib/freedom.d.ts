/** Public automation-freedom contract and action exposure matrix. */
import type { ActionDef } from './actions/types.ts';
export declare const AUTOMATION_MODES: readonly ["read-only", "standard", "autonomous", "unrestricted"];
export type AutomationMode = typeof AUTOMATION_MODES[number];
export declare const TOOL_SURFACES: readonly ["indexed", "flat"];
export type ToolSurface = typeof TOOL_SURFACES[number];
/** Every browser action name (`group.action`), straight from the registry. */
export declare const ALL_BROWSER_ACTION_NAMES: readonly string[];
export type BrowserActionName = string;
export declare function resolveAutomationMode(value: unknown): AutomationMode;
export declare function resolveToolSurface(value: unknown): ToolSurface;
/**
 * Whether an action name is a known browser action allowed under the mode. With `args`, an action
 * that bundles several operations (`automation.develop`) is judged by the operation the call selects;
 * without them, by whether any operation is usable.
 */
export declare function isBrowserActionExposed(name: string, mode: AutomationMode, args?: unknown): boolean;
export declare function browserActionsForMode(mode: AutomationMode): string[];
export interface ExposureOptions {
    modelDevelopmentEnabled: boolean;
}
/** Actions the model may use under this configuration. */
export declare function configuredBrowserActions(mode: AutomationMode, options: ExposureOptions, enabled?: boolean): string[];
/** Why an action cannot run now, or undefined when it can. */
export declare function actionUnavailableReason(action: ActionDef, mode: AutomationMode, options: ExposureOptions, enabled?: boolean, args?: unknown): string | undefined;
/** Tool names the plugin registers for a surface (empty when the service is disabled). */
export declare function configuredBrowserTools(mode: AutomationMode, options: ExposureOptions, enabled?: boolean, surface?: ToolSurface): string[];
