/**
 * The progressive-disclosure views behind `browser_index`.
 *
 * L1 is the group list (root) and one group's actions; L2 is one action's full
 * schema. Only actions usable under the current automationMode are listed;
 * the rest collapse into one line with the reason.
 * @module dsh-browser/actions/index-view
 */

import { ACTIONS, GROUP_SUMMARIES, actionsInGroup, findAction, findSubAction, findTopic, isActionGroup, traitsFor } from './registry.ts'
import { ACTION_GROUPS, type ActionDef, type ActionGroup, type ApprovalClass, type ParamSchema, type SubActionDef } from './types.ts'
import { compactParams, describeParams } from './schema.ts'
import { actionUnavailableReason, type AutomationMode, type ExposureOptions } from '../freedom.ts'
import type { ResolvedPrompts } from '../prompts.ts'

export interface IndexEnvironment {
  mode: AutomationMode
  options: ExposureOptions
  enabled: boolean
  /** True when the `dsh-browser` skill is registered with the Host. */
  skillAvailable: boolean
  /** Runtime facts worth surfacing at the root (undefined when unknown). */
  runtime?: { chromiumInstalled?: boolean; opencliInstalled?: boolean; opencliEnabled?: boolean }
  /** Deployment overrides of the text (`prompts` configuration); absent means the built-in text everywhere. */
  prompts?: ResolvedPrompts
}

// The text of a catalog entry: the configured override, else the one in the registry.
const groupSummary = (group: string, env: IndexEnvironment): string => env.prompts?.groups[group as ActionGroup] ?? GROUP_SUMMARIES[group as ActionGroup]
const summaryOf = (action: ActionDef, env: IndexEnvironment): string => env.prompts?.actions[action.name]?.summary ?? action.summary
const notesOf = (action: ActionDef, env: IndexEnvironment): string | undefined => env.prompts?.actions[action.name]?.notes ?? action.notes
const subSummary = (action: ActionDef, sub: string, env: IndexEnvironment): string => env.prompts?.actions[`${action.name}.${sub}`]?.summary ?? action.subActions!.items[sub]!.summary
const subNotes = (action: ActionDef, sub: string, env: IndexEnvironment): string | undefined => env.prompts?.actions[`${action.name}.${sub}`]?.notes ?? action.subActions!.items[sub]!.notes
const topicSummary = (action: ActionDef, topic: string, env: IndexEnvironment): string => env.prompts?.actions[`${action.name}.${topic}`]?.summary ?? action.topics![topic]!.summary
const topicText = (action: ActionDef, topic: string, env: IndexEnvironment): string => env.prompts?.actions[`${action.name}.${topic}`]?.notes ?? action.topics![topic]!.text

/** The fallback guide shown at the root when no skill service is present (kept under ~300 tokens). */
export const COMPACT_GUIDE = [
  'Guide: (1) automation.search first; if an active asset fits, automation.run it instead of exploring.',
  '(2) Else target.open -> observe.read -> act.* using locators (role+name, label, text) -> observe.read to verify.',
  '(3) act.* change pages. If a submit-like action times out (outcome_unknown), check the result before retrying.',
  '(4) Errors carry code+hint; INVALID_ARGS includes the schema; LOCATOR_AMBIGUOUS lists candidates (nothing was done). (5) Repeatable success: automation.develop draft_from_journal (uses the seq of your calls), then test with inputSets; activation is the user\'s.',
].join('\n')

const MAX_LINE = 170

function approvalNote(action: ActionDef, mode: AutomationMode): string {
  const asks: Record<ApprovalClass, (mode: AutomationMode) => string> = {
    none: () => '',
    interaction: m => m === 'standard' ? 'asks' : '',
    install: m => m === 'unrestricted' ? '' : 'asks',
    upload: m => m === 'unrestricted' ? '' : 'asks',
    evaluate: m => m === 'unrestricted' ? '' : 'asks',
    userscript: m => m === 'unrestricted' ? '' : 'asks',
    opencli: m => m === 'unrestricted' ? '' : 'asks',
    recipe: m => m === 'standard' ? 'asks if mutating' : '',
    'asset-run': m => m === 'unrestricted' ? '' : m === 'autonomous' ? 'asks for userscripts' : 'asks',
    'asset-develop': m => m === 'standard' ? 'asks to write' : '',
  }
  return asks[action.approval](mode)
}

function line(action: ActionDef, env: IndexEnvironment): string {
  const note = approvalNote(action, env.mode)
  const params = compactParams(action.params)
  const head = `${action.name} - ${summaryOf(action, env)}`
  const tail = ` | ${params || 'no args'}${note ? ` | ${note}` : ''}`
  const text = head + tail
  return text.length > MAX_LINE * 2 ? text.slice(0, MAX_LINE * 2 - 1) + '…' : text
}

function split(actions: readonly ActionDef[], env: IndexEnvironment): { usable: ActionDef[]; blocked: { action: ActionDef; reason: string }[] } {
  const usable: ActionDef[] = []
  const blocked: { action: ActionDef; reason: string }[] = []
  for (const action of actions) {
    const reason = actionUnavailableReason(action, env.mode, env.options, env.enabled)
    if (reason) blocked.push({ action, reason }); else usable.push(action)
  }
  return { usable, blocked }
}

function blockedLine(blocked: { action: ActionDef; reason: string }[]): string | undefined {
  if (!blocked.length) return undefined
  const reasons = [...new Set(blocked.map(entry => entry.reason))].join('; ')
  return `Unavailable (${reasons}): ${blocked.map(entry => entry.action.name).join(', ')}`
}

function modeNote(mode: AutomationMode): string {
  switch (mode) {
    case 'read-only': return 'read-only: page interaction, scripts, and writes are off'
    case 'standard': return 'standard: page interactions and writes ask the user first'
    case 'autonomous': return 'autonomous: interactions and recipes run directly; scripts, uploads, installs ask'
    case 'unrestricted': return 'unrestricted: no approvals (validation and budgets still apply)'
  }
}

export function renderRoot(env: IndexEnvironment): string {
  const { usable, blocked } = split(ACTIONS, env)
  const lines = [
    'dsh-browser: run actions with browser_call({action, args}); browser_index({group}) lists a group, browser_index({action}) gives one action\'s schema, browser_index({query}) searches.',
    `mode ${modeNote(env.mode)}`,
  ]
  if (env.runtime?.chromiumInstalled === false) lines.push('Chromium is NOT installed: run runtime.install first (large download).')
  if (env.runtime?.opencliEnabled && env.runtime.opencliInstalled === false) lines.push('OpenCLI is enabled but not installed.')
  lines.push('Groups:')
  for (const group of ACTION_GROUPS) {
    const count = usable.filter(action => action.group === group).length
    if (count === 0) continue
    lines.push(`  ${group} (${count}) ${groupSummary(group, env)}`)
  }
  lines.push('Reuse first: browser_call({action:"automation.search",args:{query}}) then {action:"automation.run",args:{id,url,inputs?}}.')
  const note = blockedLine(blocked)
  if (note) lines.push(note.length > 400 ? `Unavailable: ${blocked.length} actions (${[...new Set(blocked.map(entry => entry.reason))].join('; ')}); browser_index({group}) shows what is usable.` : note)
  lines.push(env.skillAvailable ? 'Load skill "dsh-browser" for workflow and locator guidance.' : env.prompts?.rootGuide ?? COMPACT_GUIDE)
  if (env.prompts?.rootNote) lines.push(env.prompts.rootNote)
  return lines.join('\n')
}

export function renderGroup(group: string, env: IndexEnvironment): string {
  if (!isActionGroup(group)) return `Unknown group "${group}". Groups: ${ACTION_GROUPS.join(', ')}.`
  const { usable, blocked } = split(actionsInGroup(group), env)
  const lines = [`${group} - ${groupSummary(group, env)}`, ...usable.map(action => line(action, env))]
  const note = blockedLine(blocked)
  if (note) lines.push(note)
  return lines.join('\n')
}

function exampleLine(action: ActionDef): string[] {
  return (action.examples ?? []).slice(0, 2).map(example => `example: browser_call(${JSON.stringify({ action: action.name, args: example.args })})${example.note ? ` // ${example.note}` : ''}`)
}

/** Approval wording for one operation of an action that bundles several (automation.develop). */
function subApprovalNote(action: ActionDef, sub: string, mode: AutomationMode): string {
  if (action.approval !== 'asset-develop') return approvalNote(action, mode)
  if (sub === 'get' || sub === 'validate') return ''
  if (sub === 'test') return mode === 'unrestricted' ? '' : mode === 'autonomous' ? 'asks for userscript drafts' : 'asks'
  return mode === 'standard' ? 'asks to write' : ''
}

function pick(params: ParamSchema, names: readonly string[]): ParamSchema {
  return Object.fromEntries(names.filter(name => name in params).map(name => [name, params[name]!]))
}

function errorsLine(action: ActionDef, mutating: boolean): string {
  const codes = action.errors ?? []
  return `errors: INVALID_ARGS, TARGET_CLOSED, DEADLINE, CANCELLED${action.group === 'act' ? ', LOCATOR_NOT_FOUND, NOT_ACTIONABLE' : ''}${action.params.expectGeneration ? ', TARGET_STALE' : ''}${codes.length ? ', ' + codes.join(', ') : ''}${mutating ? ' (a DEADLINE on this action means the outcome is unknown: verify before retrying)' : ''}`
}

/** The parameters of one operation as the detail prints them: its own required marks and descriptions. */
function subParams(action: ActionDef, sub: SubActionDef, selector: string): ParamSchema {
  const params: ParamSchema = {}
  for (const name of sub.params.filter(param => param !== selector)) {
    const node = action.params[name]
    if (!node) continue
    const hint = sub.hints?.[name]
    const { required: _required, description, ...rest } = node
    params[name] = { ...rest, ...hint !== undefined ? (hint ? { description: hint } : {}) : description ? { description } : {}, ...sub.required?.includes(name) ? { required: true as const } : {} }
  }
  return params
}

/** The parent view of an action with sub-actions: what it is, the arguments every operation shares, and one line per operation. */
function renderActionWithSubs(action: ActionDef, env: IndexEnvironment): string {
  const set = action.subActions!
  const reason = actionUnavailableReason(action, env.mode, env.options, env.enabled)
  const note = approvalNote(action, env.mode)
  const own = (sub: SubActionDef): string => sub.params.filter(name => !set.common.includes(name)).join(', ')
  const lines = [
    `${action.name} - ${summaryOf(action, env)}`,
    `group ${action.group} | changes state (get and validate only read) | ${reason ? `UNAVAILABLE: ${reason}` : note ? `approval: ${note}` : 'no approval needed'}`,
    ...notesOf(action, env) ? [notesOf(action, env)!] : [],
    'common args:',
    ...Object.entries(pick(action.params, set.common)).map(([key, node]) => `  ${key}${node.required ? '' : '?'}: ${node.enum ? node.enum.map(value => JSON.stringify(value)).join('|') : node.type ?? 'any'}${node.description ? ' - ' + node.description : ''}`),
    `sub-actions (full schema of one: browser_index({action:"${action.name}.<sub>"})):`,
    ...Object.entries(set.items).map(([key, sub]) => {
      const flags = env.mode === 'read-only' && !traitsFor(action, { [set.key]: key }).readOnly ? ' [not in read-only]' : ''
      return `  ${key} - ${subSummary(action, key, env)} | ${own(sub) || 'id only'}${flags}`
    }),
    errorsLine(action, action.mutating),
  ]
  return lines.join('\n')
}

/** One operation of an action with sub-actions: only its own arguments, notes and example. */
function renderSubAction(action: ActionDef, subName: string, env: IndexEnvironment): string {
  const set = action.subActions!
  const sub = set.items[subName]!
  const traits = traitsFor(action, { [set.key]: subName })
  const name = `${action.name}.${subName}`
  const reason = actionUnavailableReason(action, env.mode, env.options, env.enabled, { [set.key]: subName })
  const note = subApprovalNote(action, subName, env.mode)
  const lines = [
    `${name} - ${subSummary(action, subName, env)}`,
    `call: browser_call({action:"${action.name}",args:{${set.key}:"${subName}",...}}) | ${traits.mutating ? 'changes state' : 'read/observe'} | ${reason ? `UNAVAILABLE: ${reason}` : note ? `approval: ${note}` : 'no approval needed'}`,
    ...subNotes(action, subName, env) ? [subNotes(action, subName, env)!] : [],
    'args:',
    `  ${set.key}: "${subName}" - selects this operation`,
    ...describeParams(subParams(action, sub, set.key)).filter(line => line !== '  (no arguments)'),
    ...(sub.examples ?? []).slice(0, 2).map(example => `example: browser_call(${JSON.stringify({ action: action.name, args: example.args })})${example.note ? ` // ${example.note}` : ''}`),
    `errors: INVALID_ARGS${sub.params.includes('url') ? ', TARGET_CLOSED, DEADLINE, CANCELLED' : ''}${sub.errors?.length ? ', ' + sub.errors.join(', ') : ''}${traits.mutating && sub.params.includes('url') ? ' (a DEADLINE here means the outcome is unknown: verify before retrying)' : ''}`,
  ]
  return lines.join('\n')
}

export function renderAction(name: string, env: IndexEnvironment): string {
  const action = findAction(name)
  if (!action) {
    const nested = findSubAction(name)
    if (nested) return renderSubAction(nested.action, nested.sub, env)
    const topic = findTopic(name)
    if (topic) return `${name} - ${topicSummary(topic.action, topic.topic, env)}\n${topicText(topic.action, topic.topic, env)}`
    if (isActionGroup(name)) return renderGroup(name, env)
    const hits = searchActions(name, env).slice(0, 5)
    return `Unknown action "${name}".${hits.length ? ' Similar: ' + hits.map(hit => hit.name).join(', ') + '.' : ''} browser_index() lists the groups.`
  }
  if (action.subActions) return renderActionWithSubs(action, env)
  const reason = actionUnavailableReason(action, env.mode, env.options, env.enabled)
  const note = approvalNote(action, env.mode)
  const lines = [
    `${action.name} - ${summaryOf(action, env)}`,
    `group ${action.group} | ${action.mutating ? 'changes state' : 'read/observe'} | ${reason ? `UNAVAILABLE: ${reason}` : note ? `approval: ${note}` : 'no approval needed'}`,
    ...notesOf(action, env) ? [notesOf(action, env)!] : [],
    'args:',
    ...describeParams(action.params),
    ...exampleLine(action),
    ...topicLines(action, env),
    errorsLine(action, action.mutating),
  ]
  return lines.join('\n')
}

/** The extra detail pages of an action, one line each. */
function topicLines(action: ActionDef, env: IndexEnvironment): string[] {
  const topics = Object.keys(action.topics ?? {})
  if (!topics.length) return []
  return [`more detail: ${topics.map(key => `browser_index({action:"${action.name}.${key}"}) ${topicSummary(action, key, env)}`).join(' | ')}`]
}

function score(action: ActionDef, terms: string[], env: IndexEnvironment): number {
  const name = action.name.toLowerCase()
  const summary = (summaryOf(action, env) + ' ' + Object.keys(action.subActions?.items ?? {}).map(key => key + ' ' + subSummary(action, key, env)).join(' ')).toLowerCase()
  const params = Object.keys(action.params).join(' ').toLowerCase()
  let total = 0
  for (const term of terms) {
    if (name === term) total += 10
    else if (name.includes(term)) total += 5
    if (summary.includes(term)) total += 2
    if (action.group === term) total += 3
    if (params.includes(term)) total += 1
  }
  return total
}

export function searchActions(query: string, env: IndexEnvironment): ActionDef[] {
  const terms = query.toLowerCase().split(/[^a-z0-9_.]+/).filter(Boolean)
  if (!terms.length) return []
  const { usable } = split(ACTIONS, env)
  return usable.map(action => ({ action, score: score(action, terms, env) })).filter(entry => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.action.name.localeCompare(b.action.name)).slice(0, 8).map(entry => entry.action)
}

export function renderSearch(query: string, env: IndexEnvironment): string {
  const hits = searchActions(query, env)
  if (!hits.length) return `No usable action matches "${query}". browser_index() lists the groups.`
  return [`${hits.length} match${hits.length === 1 ? '' : 'es'} for "${query}":`, ...hits.map(action => line(action, env))].join('\n')
}

/** Resolve a `browser_index` call to text. `action` wins over `group`, which wins over `query`. */
export function renderIndex(args: { group?: string; action?: string; query?: string }, env: IndexEnvironment): { level: 'root' | 'group' | 'action' | 'search'; text: string } {
  if (args.action) return { level: 'action', text: renderAction(args.action, env) }
  if (args.group) return { level: 'group', text: renderGroup(args.group, env) }
  if (args.query) return { level: 'search', text: renderSearch(args.query, env) }
  return { level: 'root', text: renderRoot(env) }
}
