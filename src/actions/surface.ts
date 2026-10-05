/**
 * Maps a model-visible tool call to the action it will run, so the Host
 * approval hook can judge `browser_call` and flat tools by action rather than
 * by tool name.
 * @module dsh-browser/actions/surface
 */

import { CALL_TOOL, INDEX_TOOL, findAction, findActionByFlatTool, validateActionArgs } from './registry.ts'

export type ResolvedBrowserCall =
  /** `browser_index`: read-only catalog, no side effects. */
  | { kind: 'index' }
  /** A call that names a known action; `args` are the action's own arguments. */
  | { kind: 'action'; action: string; args: unknown }
  /** `browser_call` with a missing or unknown action; execution returns a structured error. */
  | { kind: 'unresolved' }

export function resolveBrowserCall(toolName: string, rawArgs: unknown): ResolvedBrowserCall | undefined {
  if (toolName === INDEX_TOOL) return { kind: 'index' }
  if (toolName === CALL_TOOL) {
    const input = (rawArgs && typeof rawArgs === 'object' ? rawArgs : {}) as { action?: unknown; args?: unknown }
    return findAction(input.action) ? { kind: 'action', action: input.action as string, args: input.args ?? {} } : { kind: 'unresolved' }
  }
  const flat = findActionByFlatTool(toolName)
  return flat ? { kind: 'action', action: flat.name, args: rawArgs ?? {} } : undefined
}

/**
 * Whether `runAction` would refuse these arguments for their shape (`INVALID_ARGS`) before running anything.
 * It is the very check `runAction` makes (`validateActionArgs`), so the approval hook can leave such a call
 * unasked: asking about a call that cannot run only teaches the user to click through prompts. False for a
 * name that is not an action.
 */
export function argsRejectedByExecutor(actionName: string, args: unknown): boolean {
  const action = findAction(actionName)
  return action !== undefined && !validateActionArgs(action, args).ok
}
