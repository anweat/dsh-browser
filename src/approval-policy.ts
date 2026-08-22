/** Approval classification for multi-action and arbitrary-code browser tools. */

import { recipeNeedsApproval, type BrowserRecipeStep } from './automation.ts'
import { validateUserscript } from './scripts.ts'
import { isBrowserToolExposed, type AutomationMode } from './freedom.ts'

export type BrowserPolicyDecision =
  | { kind: 'allow' }
  | { kind: 'deny'; reason: string }
  | { kind: 'ask'; reason: string }

const DIRECT_INTERACTIONS = new Set(['browser_click', 'browser_type', 'browser_scroll'])

export function browserPolicyDecision(name: string, args: unknown, mode: AutomationMode = 'standard'): BrowserPolicyDecision {
  if (!isBrowserToolExposed(name, mode) && name.startsWith('browser_')) {
    return { kind: 'deny', reason: `Browser tool ${name} is disabled by automationMode=${mode}` }
  }
  if (DIRECT_INTERACTIONS.has(name)) {
    if (mode === 'read-only') return { kind: 'deny', reason: `Page interaction is disabled by automationMode=${mode}` }
    if (mode === 'standard') return { kind: 'ask', reason: 'Run a direct Playwright page interaction: ' + name }
  }
  if (name === 'browser_install') {
    if (mode === 'read-only') return { kind: 'deny', reason: `Browser installation is disabled by automationMode=${mode}` }
    if (mode === 'unrestricted') return { kind: 'allow' }
    return { kind: 'ask', reason: 'Install Playwright Chromium into the shared browser cache' }
  }
  if (name === 'browser_userscript_run') {
    const input = args as { source?: unknown; url?: unknown }
    if (typeof input.source !== 'string' || typeof input.url !== 'string') return { kind: 'deny', reason: 'external userscript requires source and URL' }
    const validation = validateUserscript(input.source, input.url)
    if (!validation.valid) return { kind: 'deny', reason: 'invalid external userscript: ' + validation.errors.join('; ') }
    if (mode === 'read-only') return { kind: 'deny', reason: `External userscripts are disabled by automationMode=${mode}` }
    if (mode === 'unrestricted') return { kind: 'allow' }
    const host = new URL(input.url).hostname
    return {
      kind: 'ask',
      reason: `Run external userscript "${validation.metadata.name}" (${validation.sha256.slice(0, 12)}) on ${host}; capabilities: ${validation.capabilities.join(', ')}`,
    }
  }
  if (name === 'browser_opencli_run') {
    const input = args as { args?: unknown }
    const argv = Array.isArray(input.args) ? input.args.filter(value => typeof value === 'string') as string[] : []
    if (mode === 'read-only') return { kind: 'deny', reason: `General OpenCLI commands are disabled by automationMode=${mode}` }
    if (mode === 'unrestricted') return { kind: 'allow' }
    return { kind: 'ask', reason: 'Run a general OpenCLI command with the logged-in Chrome profile: ' + (argv.slice(0, 3).join(' ') || '(empty)') }
  }
  if (name === 'browser_recipe_run') {
    const input = args as { steps?: unknown }
    const steps = Array.isArray(input.steps) ? input.steps as BrowserRecipeStep[] : []
    if (recipeNeedsApproval(steps)) {
      const actions = [...new Set(steps.map(step => step.type).filter(type => !['wait', 'extract', 'assert', 'screenshot'].includes(type)))]
      if (mode === 'read-only') return { kind: 'deny', reason: `Mutating recipes are disabled by automationMode=${mode}: ` + actions.join(', ') }
      if (mode === 'autonomous' || mode === 'unrestricted') return { kind: 'allow' }
      return { kind: 'ask', reason: 'Run a multi-step Playwright recipe with page mutations: ' + actions.join(', ') }
    }
  }
  return { kind: 'allow' }
}
