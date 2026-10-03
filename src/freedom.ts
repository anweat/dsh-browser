/** Public automation-freedom contract and action exposure matrix. */

import { ACTIONS, CALL_TOOL, INDEX_TOOL, findAction, flatToolName, readOnlyCapable, traitsFor } from './actions/registry.ts'
import type { ActionDef } from './actions/types.ts'

export const AUTOMATION_MODES = ['read-only', 'standard', 'autonomous', 'unrestricted'] as const
export type AutomationMode = typeof AUTOMATION_MODES[number]

export const TOOL_SURFACES = ['indexed', 'flat'] as const
export type ToolSurface = typeof TOOL_SURFACES[number]

/** Every browser action name (`group.action`), straight from the registry. */
export const ALL_BROWSER_ACTION_NAMES: readonly string[] = ACTIONS.map(action => action.name)
export type BrowserActionName = string

export function resolveAutomationMode(value: unknown): AutomationMode {
  const mode = value ?? 'standard'
  if (typeof mode !== 'string' || !AUTOMATION_MODES.includes(mode as AutomationMode)) {
    throw new Error('automationMode must be one of: ' + AUTOMATION_MODES.join(', '))
  }
  return mode as AutomationMode
}

export function resolveToolSurface(value: unknown): ToolSurface {
  const surface = value ?? 'indexed'
  if (typeof surface !== 'string' || !TOOL_SURFACES.includes(surface as ToolSurface)) {
    throw new Error('toolSurface must be one of: ' + TOOL_SURFACES.join(', '))
  }
  return surface as ToolSurface
}

/**
 * Whether an action name is a known browser action allowed under the mode. With `args`, an action
 * that bundles several operations (`automation.develop`) is judged by the operation the call selects;
 * without them, by whether any operation is usable.
 */
export function isBrowserActionExposed(name: string, mode: AutomationMode, args?: unknown): boolean {
  const action = findAction(name)
  if (!action) return false
  if (mode !== 'read-only') return true
  return args === undefined ? readOnlyCapable(action) : traitsFor(action, args).readOnly
}

export function browserActionsForMode(mode: AutomationMode): string[] {
  return ALL_BROWSER_ACTION_NAMES.filter(name => isBrowserActionExposed(name, mode))
}

export interface ExposureOptions { modelDevelopmentEnabled: boolean }

/** Actions the model may use under this configuration. */
export function configuredBrowserActions(mode: AutomationMode, options: ExposureOptions, enabled = true): string[] {
  if (!enabled) return []
  return browserActionsForMode(mode).filter(name => name !== 'automation.develop' || options.modelDevelopmentEnabled)
}

/** Why an action cannot run now, or undefined when it can. */
export function actionUnavailableReason(action: ActionDef, mode: AutomationMode, options: ExposureOptions, enabled = true, args?: unknown): string | undefined {
  if (!enabled) return 'browser service is disabled (enabled=false)'
  if (mode === 'read-only' && !(args === undefined ? readOnlyCapable(action) : traitsFor(action, args).readOnly)) {
    return args !== undefined && action.subActions && readOnlyCapable(action) ? `disabled by automationMode=${mode} for ${action.subActions.key}=${String((args as Record<string, unknown>)[action.subActions.key])}` : `disabled by automationMode=${mode}`
  }
  if (action.name === 'automation.develop' && !options.modelDevelopmentEnabled) return 'disabled by automationAssets.modelDevelopmentEnabled=false'
  return undefined
}

/** Tool names the plugin registers for a surface (empty when the service is disabled). */
export function configuredBrowserTools(mode: AutomationMode, options: ExposureOptions, enabled = true, surface: ToolSurface = 'indexed'): string[] {
  if (!enabled) return []
  if (surface === 'indexed') return [INDEX_TOOL, CALL_TOOL]
  const exposed = new Set(configuredBrowserActions(mode, options, enabled))
  return ACTIONS.filter(action => exposed.has(action.name)).map(flatToolName)
}
