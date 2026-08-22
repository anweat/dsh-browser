/** Approval classification for multi-action and arbitrary-code browser tools. */

import { recipeNeedsApproval, type BrowserRecipeStep } from './automation.ts'
import { validateUserscript } from './scripts.ts'

export type BrowserPolicyDecision =
  | { kind: 'allow' }
  | { kind: 'deny'; reason: string }
  | { kind: 'ask'; reason: string }

export function browserPolicyDecision(name: string, args: unknown): BrowserPolicyDecision {
  if (name === 'browser_userscript_run') {
    const input = args as { source?: unknown; url?: unknown }
    if (typeof input.source !== 'string' || typeof input.url !== 'string') return { kind: 'deny', reason: 'external userscript requires source and URL' }
    const validation = validateUserscript(input.source, input.url)
    if (!validation.valid) return { kind: 'deny', reason: 'invalid external userscript: ' + validation.errors.join('; ') }
    const host = new URL(input.url).hostname
    return {
      kind: 'ask',
      reason: `Run external userscript "${validation.metadata.name}" (${validation.sha256.slice(0, 12)}) on ${host}; capabilities: ${validation.capabilities.join(', ')}`,
    }
  }
  if (name === 'browser_opencli_run') {
    const input = args as { args?: unknown }
    const argv = Array.isArray(input.args) ? input.args.filter(value => typeof value === 'string') as string[] : []
    return { kind: 'ask', reason: 'Run a general OpenCLI command with the logged-in Chrome profile: ' + (argv.slice(0, 3).join(' ') || '(empty)') }
  }
  if (name === 'browser_recipe_run') {
    const input = args as { steps?: unknown }
    const steps = Array.isArray(input.steps) ? input.steps as BrowserRecipeStep[] : []
    if (recipeNeedsApproval(steps)) {
      const actions = [...new Set(steps.map(step => step.type).filter(type => !['wait', 'extract', 'assert', 'screenshot'].includes(type)))]
      return { kind: 'ask', reason: 'Run a multi-step Playwright recipe with page mutations: ' + actions.join(', ') }
    }
  }
  return { kind: 'allow' }
}
