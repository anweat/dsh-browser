/**
 * The action registry: the single definition of every model-visible browser
 * capability. Tool surfaces, approval policy, and exposure rules are all
 * derived from this list.
 * @module dsh-browser/actions/registry
 */

import { ACTION_GROUPS, type ActionDef, type ActionGroup } from './types.ts'
import { RUNTIME_ACTIONS } from './runtime.ts'
import { TARGET_ACTIONS } from './target.ts'
import { OBSERVE_ACTIONS } from './observe.ts'
import { ACT_ACTIONS } from './act.ts'
import { INSPECT_ACTIONS } from './inspect.ts'
import { SCRIPT_ACTIONS } from './script.ts'
import { AUTOMATION_ACTIONS } from './automation.ts'
import { CRAWL_ACTIONS } from './crawl.ts'
import { OPENCLI_ACTIONS } from './opencli.ts'

export const ACTIONS: readonly ActionDef[] = [
  ...RUNTIME_ACTIONS, ...TARGET_ACTIONS, ...OBSERVE_ACTIONS, ...ACT_ACTIONS, ...INSPECT_ACTIONS,
  ...SCRIPT_ACTIONS, ...AUTOMATION_ACTIONS, ...CRAWL_ACTIONS, ...OPENCLI_ACTIONS,
]

const BY_NAME = new Map(ACTIONS.map(action => [action.name, action]))

export const GROUP_SUMMARIES: Record<ActionGroup, string> = {
  runtime: 'runtime status and Chromium install',
  target: 'open / close / list this session\'s page',
  observe: 'read page text, screenshots',
  act: 'click, fill, type, clear, press, select, check, hover, scroll, upload, wait',
  inspect: 'captured console and failed-request records',
  script: 'page JavaScript, built-in scripts, userscripts',
  automation: 'search/run reusable assets, develop drafts, inline recipes',
  crawl: 'bounded multi-page crawl',
  opencli: 'bundled OpenCLI site adapters',
}

export function isActionGroup(value: unknown): value is ActionGroup {
  return typeof value === 'string' && (ACTION_GROUPS as readonly string[]).includes(value)
}

export function findAction(name: unknown): ActionDef | undefined {
  return typeof name === 'string' ? BY_NAME.get(name) : undefined
}

export function actionsInGroup(group: ActionGroup): ActionDef[] {
  return ACTIONS.filter(action => action.group === group)
}

/** Tool name for an action on the flat surface: `browser_<group>_<action>` (`browser_crawl` for crawl.crawl). */
export function flatToolName(action: ActionDef): string {
  const [group, name] = action.name.split('.') as [string, string]
  return group === name ? `browser_${group}` : `browser_${group}_${name}`
}

const BY_FLAT_NAME = new Map(ACTIONS.map(action => [flatToolName(action), action]))

export function findActionByFlatTool(toolName: string): ActionDef | undefined {
  return BY_FLAT_NAME.get(toolName)
}

/** The two tools of the indexed surface. */
export const INDEX_TOOL = 'browser_index'
export const CALL_TOOL = 'browser_call'
