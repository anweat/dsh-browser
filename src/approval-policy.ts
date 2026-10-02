/**
 * Approval classification, per action.
 *
 * The Host hook resolves a model tool call (`browser_call`, or a flat
 * per-action tool) to an action name plus its arguments and asks this module
 * for a decision. Each action carries an approval class in the registry; the
 * rules below interpret that class for the current automationMode. Reasons
 * name the action and its key arguments, so the user sees `act.click #submit`
 * rather than a generic dispatcher tool.
 * @module dsh-browser/approval-policy
 */

import { READ_ONLY_ACTIONS, recipeNeedsApproval, type AnyRecipeStep } from './automation.ts'
import { validateUserscript } from './scripts.ts'
import { isBrowserActionExposed, type AutomationMode } from './freedom.ts'
import { findAction } from './actions/registry.ts'

export type BrowserPolicyDecision =
  | { kind: 'allow' }
  | { kind: 'deny'; reason: string }
  | { kind: 'ask'; reason: string }

const WEB_LOCAL_MUTATIONS = new Set(['web_cache_clear'])

const clip = (text: string, max = 120): string => text.length > max ? text.slice(0, max) + '…' : text

/** Short, human-readable description of an action's target for approval prompts. */
function targetLabel(args: unknown): string {
  const input = (args && typeof args === 'object' ? args : {}) as { selector?: unknown; locator?: unknown }
  if (typeof input.selector === 'string') return clip(input.selector)
  const locator = input.locator as Record<string, unknown> | undefined
  if (locator && typeof locator === 'object') {
    const parts = ['role', 'name', 'text', 'label', 'testId', 'selector', 'css'].filter(key => typeof locator[key] === 'string').map(key => `${key}=${JSON.stringify(clip(String(locator[key]), 60))}`)
    if (parts.length) return parts.join(' ')
  }
  return '(page)'
}

/** `act.fill #q (4 chars)` style summary of a direct interaction. */
function interactionLabel(name: string, args: unknown): string {
  const input = (args && typeof args === 'object' ? args : {}) as Record<string, unknown>
  const extras: string[] = []
  if ((name === 'act.fill' || name === 'act.type') && typeof input.text === 'string') extras.push(`${input.text.length} chars`)
  if (name === 'act.press' && typeof input.key === 'string') extras.push(`key ${clip(input.key, 40)}`)
  if (name === 'act.select' && Array.isArray(input.values)) extras.push('values ' + clip(input.values.map(String).join(',')))
  if (name === 'act.check') extras.push(input.checked === false ? 'uncheck' : 'check')
  if (name === 'act.scroll') extras.push(`deltaY ${typeof input.deltaY === 'number' ? input.deltaY : 2000}`)
  return `${name} ${targetLabel(args)}${extras.length ? ' (' + extras.join('; ') + ')' : ''}`
}

/**
 * Decide whether a call may run.
 * @param name - an action name (`act.click`) or one of the WebSearch tool names this policy also guards.
 * @param args - the action's own arguments (never the `browser_call` wrapper).
 * @param mode - the configured automationMode.
 * @param assetKind - for `automation.run`, the kind of the asset about to run.
 */
export function browserPolicyDecision(name: string, args: unknown, mode: AutomationMode = 'standard', assetKind?: 'recipe' | 'userscript'): BrowserPolicyDecision {
  const action = findAction(name)
  if (!action && (name.startsWith('browser_') || /^[a-z]+\.[a-z_]+$/.test(name))) {
    return { kind: 'deny', reason: `Unknown browser action ${name}; browser tools are reached through browser_index / browser_call` }
  }
  if (action) {
    if (!isBrowserActionExposed(name, mode)) return { kind: 'deny', reason: `Browser action ${name} is disabled by automationMode=${mode}` }
    switch (action.approval) {
      case 'interaction': {
        if (mode === 'read-only') return { kind: 'deny', reason: `Page interaction is disabled by automationMode=${mode}` }
        if (mode === 'standard') return { kind: 'ask', reason: 'Run a direct Playwright page interaction: ' + interactionLabel(name, args) }
        return { kind: 'allow' }
      }
      case 'install': {
        if (mode === 'read-only') return { kind: 'deny', reason: `Browser installation is disabled by automationMode=${mode}` }
        if (mode === 'unrestricted') return { kind: 'allow' }
        return { kind: 'ask', reason: `${name}: Install Playwright Chromium into the shared browser cache` }
      }
      case 'upload': {
        const files = Array.isArray((args as { files?: unknown })?.files)
          ? (args as { files: unknown[] }).files.filter(value => typeof value === 'string') as string[]
          : []
        if (files.length === 0) return { kind: 'deny', reason: `${name} requires one or more absolute file paths` }
        if (mode === 'read-only') return { kind: 'deny', reason: `Local file upload is disabled by automationMode=${mode}` }
        if (mode === 'unrestricted') return { kind: 'allow' }
        return { kind: 'ask', reason: `${name} ${targetLabel(args)}: Read local files and expose them to the current website upload control: ` + files.slice(0, 5).join(', ') }
      }
      case 'evaluate': {
        const expression = (args as { expression?: unknown })?.expression
        if (typeof expression !== 'string' || !expression.trim()) return { kind: 'deny', reason: `${name} requires a JavaScript expression` }
        if (expression.length > 20_000) return { kind: 'deny', reason: `${name} expression exceeds 20,000 characters` }
        if (mode === 'read-only') return { kind: 'deny', reason: `Page JavaScript execution is disabled by automationMode=${mode}` }
        if (mode === 'unrestricted') return { kind: 'allow' }
        return { kind: 'ask', reason: `${name} \`${clip(expression.replace(/\s+/g, ' '), 100)}\`: Run JavaScript with the current page origin and login state; it may access page storage, non-HttpOnly cookies, and browser-permitted network APIs` }
      }
      case 'userscript': {
        const input = (args ?? {}) as { source?: unknown; url?: unknown }
        if (typeof input.source !== 'string' || typeof input.url !== 'string') return { kind: 'deny', reason: 'external userscript requires source and URL' }
        const validation = validateUserscript(input.source, input.url)
        if (!validation.valid) return { kind: 'deny', reason: 'invalid external userscript: ' + validation.errors.join('; ') }
        if (mode === 'read-only') return { kind: 'deny', reason: `External userscripts are disabled by automationMode=${mode}` }
        if (mode === 'unrestricted') return { kind: 'allow' }
        const host = new URL(input.url).hostname
        return {
          kind: 'ask',
          reason: `${name}: Run external userscript "${validation.metadata.name}" (${validation.sha256.slice(0, 12)}) on ${host}; capabilities: ${validation.capabilities.join(', ')}`,
        }
      }
      case 'opencli': {
        const input = (args ?? {}) as { args?: unknown }
        const argv = Array.isArray(input.args) ? input.args.filter(value => typeof value === 'string') as string[] : []
        if (mode === 'read-only') return { kind: 'deny', reason: `General OpenCLI commands are disabled by automationMode=${mode}` }
        if (mode === 'unrestricted') return { kind: 'allow' }
        return { kind: 'ask', reason: `${name}: Run a general OpenCLI command with the logged-in Chrome profile: ` + (argv.slice(0, 3).join(' ') || '(empty)') }
      }
      case 'recipe': {
        const input = (args ?? {}) as { steps?: unknown }
        const steps = Array.isArray(input.steps) ? input.steps as AnyRecipeStep[] : []
        if (recipeNeedsApproval(steps)) {
          const actions = [...new Set(steps.map(step => step.type).filter(type => !READ_ONLY_ACTIONS.has(type)))]
          if (mode === 'read-only') return { kind: 'deny', reason: `Mutating recipes are disabled by automationMode=${mode}: ` + actions.join(', ') }
          if (mode === 'autonomous' || mode === 'unrestricted') return { kind: 'allow' }
          return { kind: 'ask', reason: `${name}: Run a multi-step Playwright recipe with page mutations: ` + actions.join(', ') }
        }
        return { kind: 'allow' }
      }
      case 'asset-run': {
        const id = (args as { id?: unknown })?.id
        const label = typeof id === 'string' ? ` ${clip(id, 60)}` : ''
        if (mode === 'read-only') return { kind: 'deny', reason: `Reusable automation execution is disabled by automationMode=${mode}` }
        if (mode === 'unrestricted' || (mode === 'autonomous' && assetKind === 'recipe')) return { kind: 'allow' }
        return { kind: 'ask', reason: `${name}${label}: Run an active reusable browser automation asset` }
      }
      case 'asset-develop': {
        const develop = String((args as { action?: unknown })?.action ?? '')
        if (['get', 'validate'].includes(develop)) return { kind: 'allow' }
        if (mode === 'read-only') return { kind: 'deny', reason: `Automation draft writes are disabled by automationMode=${mode}` }
        if (develop === 'test' && mode !== 'unrestricted') return { kind: 'ask', reason: `${name} test: Replay a reusable automation draft in a real browser context` }
        if (mode === 'standard') return { kind: 'ask', reason: `${name} ${develop || '(unspecified)'}: Save a bounded local reusable automation draft` }
        return { kind: 'allow' }
      }
      case 'none':
        return { kind: 'allow' }
    }
  }
  if (name === 'web_deps' && (args as { action?: unknown })?.action === 'install') {
    if (mode === 'read-only') return { kind: 'deny', reason: `Dependency installation is disabled by automationMode=${mode}` }
    if (mode === 'unrestricted') return { kind: 'allow' }
    return { kind: 'ask', reason: 'Install an external Web Search Pro backend dependency' }
  }
  const webRuleAction = name === 'web_rule' ? (args as { action?: unknown })?.action : undefined
  if (WEB_LOCAL_MUTATIONS.has(name) || (name === 'web_rule' && ['upsert', 'remove', 'import'].includes(String(webRuleAction)))) {
    if (mode === 'read-only') return { kind: 'deny', reason: `Web Search Pro mutations are disabled by automationMode=${mode}` }
    if (mode === 'standard') return { kind: 'ask', reason: 'Modify Web Search Pro local state: ' + name }
  }
  return { kind: 'allow' }
}
