/** Public automation-freedom contract and tool exposure matrix. */

export const AUTOMATION_MODES = ['read-only', 'standard', 'autonomous', 'unrestricted'] as const
export type AutomationMode = typeof AUTOMATION_MODES[number]

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
  'browser_automation_run',
  'browser_opencli_status',
  'browser_opencli_catalog',
  'browser_opencli_run',
  'browser_crawl',
] as const

export type BrowserToolName = typeof ALL_BROWSER_TOOL_NAMES[number]

const READ_ONLY_TOOL_NAMES = new Set<BrowserToolName>([
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
  'browser_opencli_status',
  'browser_opencli_catalog',
  'browser_crawl',
])

export function resolveAutomationMode(value: unknown): AutomationMode {
  const mode = value ?? 'standard'
  if (typeof mode !== 'string' || !AUTOMATION_MODES.includes(mode as AutomationMode)) {
    throw new Error('automationMode must be one of: ' + AUTOMATION_MODES.join(', '))
  }
  return mode as AutomationMode
}

export function isBrowserToolExposed(name: string, mode: AutomationMode): name is BrowserToolName {
  if (!ALL_BROWSER_TOOL_NAMES.includes(name as BrowserToolName)) return false
  return mode !== 'read-only' || READ_ONLY_TOOL_NAMES.has(name as BrowserToolName)
}

export function browserToolsForMode(mode: AutomationMode): BrowserToolName[] {
  return ALL_BROWSER_TOOL_NAMES.filter(name => isBrowserToolExposed(name, mode))
}
