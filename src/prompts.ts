/**
 * Deployment overrides of the model-facing text (`prompts` configuration).
 *
 * Every sentence the model reads that is guidance rather than contract can be replaced by the
 * deployer: the two L0 tool descriptions, the root guide, group and action summaries and notes,
 * error hints, and the `dsh-browser` skill. Names, parameter schemas, error codes, approval
 * wording and the compliance notice are NOT configurable.
 *
 * This module is the one place that knows the shape: it validates a raw `prompts` value into
 * {@link ResolvedPrompts} (never throwing: bad entries are dropped and reported as diagnostics),
 * lists the built-in defaults in the same shape ({@link defaultPrompts}, behind `prompts:dump`),
 * and measures what an override does to the context budget.
 * @module dsh-browser/prompts
 */

import path from 'node:path'
import { ACTIONS, GROUP_SUMMARIES, findAction, findSubAction, findTopic } from './actions/registry.ts'
import { ACTION_GROUPS, ERROR_CODES, type ActionGroup } from './actions/types.ts'
import { DEFAULT_ERROR_HINTS } from './actions/errors.ts'
import { COMPACT_GUIDE, renderIndex, type IndexEnvironment } from './actions/index-view.ts'
import { DEFAULT_CALL_DESCRIPTION, DEFAULT_INDEX_DESCRIPTION, PROMPT_TOOL_NAMES, indexedToolDefinitions } from './tool-defs.ts'
import { readSkill, loadSkillBodyFile, SKILL_BODY_FILE_LIMIT } from './skill.ts'
import type { AutomationMode, ExposureOptions } from './freedom.ts'

/** Length caps (in characters) of each kind of override. A longer value is ignored, not truncated. */
export const PROMPT_LIMITS = {
  /** A group or action summary: one line of the catalog. */
  summary: 300,
  /** The extra guidance of an action or sub-action. */
  notes: 1000,
  /** The text of a detail topic (`observe.read.controls`), which is a page of its own. */
  topicText: 3500,
  /** A tool description (`prompts.tools.<tool>.description`). */
  description: 1500,
  /** The compact guide that replaces the skill pointer at the root. */
  rootGuide: 1500,
  /** The deployer's note at the end of the root. */
  rootNote: 800,
  /** The hint of one error code. */
  errorHint: 600,
  /** The skill's description in the skill list. */
  skillDescription: 1000,
  /** Text appended to the skill body. */
  skillAppend: 4000,
  /** A `skill.bodyFile` larger than this falls back to the packaged body. */
  skillBodyFile: SKILL_BODY_FILE_LIMIT,
} as const

/** Context budgets from the tool-system design (estimated tokens = characters / 3.5, as `measure:tools` counts). */
export const CHARS_PER_TOKEN = 3.5
export const L0_BUDGET_TOKENS = 1500
export const LAYER_BUDGET_TOKENS = 1000

export type PromptDiagnosticCode =
  | 'invalid-type' | 'too-long' | 'unknown-key' | 'unknown-group' | 'unknown-action' | 'unknown-error-code' | 'not-overridable'
  | 'relative-body-file' | 'body-file' | 'budget-l0' | 'budget-layer'

export interface PromptDiagnostic {
  level: 'warn' | 'info'
  code: PromptDiagnosticCode
  /** The configuration key the entry is about, e.g. `actions.act.click.summary`. */
  key: string
  message: string
}

/** One accepted override, by key and length only (the text itself is never echoed back). */
export interface AppliedPrompt {
  key: string
  length?: number
}

/** The validated, effective overrides. Absent members mean "use the built-in text". */
export interface ResolvedPrompts {
  tools: { browser_index?: string; browser_call?: string }
  rootGuide?: string
  rootNote?: string
  groups: Partial<Record<ActionGroup, string>>
  /** Keyed by `group.action`, `group.action.sub` or `group.action.topic`; a topic's `notes` is its detail text. */
  actions: Record<string, { summary?: string; notes?: string }>
  errorHints: Partial<Record<string, string>>
  skill: { enabled: boolean; description?: string; bodyFile?: string; append?: string }
  applied: AppliedPrompt[]
  diagnostics: PromptDiagnostic[]
}

/** The overrides of nothing: what the plugin uses when `prompts` is not configured. */
export const NO_PROMPTS: ResolvedPrompts = Object.freeze({
  tools: Object.freeze({}), groups: Object.freeze({}), actions: Object.freeze({}), errorHints: Object.freeze({}),
  skill: Object.freeze({ enabled: true }), applied: Object.freeze([]) as never, diagnostics: Object.freeze([]) as never,
}) as ResolvedPrompts

/** The error codes whose hint has one fixed text, and so can be replaced. */
export const OVERRIDABLE_ERROR_CODES: readonly string[] = Object.keys(DEFAULT_ERROR_HINTS)

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/**
 * Validate a raw `prompts` value. Never throws: a malformed or unknown entry is left out and described in
 * `diagnostics`; everything else still applies.
 */
export function resolvePrompts(raw: unknown): ResolvedPrompts {
  if (raw === undefined || raw === null) return NO_PROMPTS
  const diagnostics: PromptDiagnostic[] = []
  const applied: AppliedPrompt[] = []
  const warn = (code: PromptDiagnosticCode, key: string, message: string): void => { diagnostics.push({ level: 'warn', code, key, message }) }
  if (!isRecord(raw)) {
    warn('invalid-type', 'prompts', 'prompts must be an object; ignored')
    return { ...NO_PROMPTS, diagnostics }
  }

  /** A text override: blank means "use the default"; a wrong type or an over-long value is ignored. */
  const text = (value: unknown, key: string, limit: number): string | undefined => {
    if (value === undefined || value === null) return undefined
    if (typeof value !== 'string') { warn('invalid-type', key, `${key} must be a string; ignored`); return undefined }
    if (value.trim() === '') return undefined
    if (value.length > limit) { warn('too-long', key, `${key} is ${value.length} characters, over the limit of ${limit}; ignored`); return undefined }
    applied.push({ key, length: value.length })
    return value
  }
  const unknownKeys = (value: Record<string, unknown>, allowed: readonly string[], prefix: string): void => {
    for (const name of Object.keys(value)) if (!allowed.includes(name)) warn('unknown-key', prefix ? `${prefix}.${name}` : name, `${prefix ? `${prefix}.${name}` : name} is not a prompts key; ignored`)
  }
  const section = (value: unknown, key: string): Record<string, unknown> | undefined => {
    if (value === undefined || value === null) return undefined
    if (!isRecord(value)) { warn('invalid-type', key, `${key} must be an object; ignored`); return undefined }
    return value
  }

  unknownKeys(raw, ['tools', 'rootGuide', 'rootNote', 'groups', 'actions', 'errorHints', 'skill'], '')

  const tools: ResolvedPrompts['tools'] = {}
  const toolsRaw = section(raw.tools, 'tools')
  if (toolsRaw) {
    unknownKeys(toolsRaw, PROMPT_TOOL_NAMES, 'tools')
    for (const name of PROMPT_TOOL_NAMES) {
      const entry = section(toolsRaw[name], `tools.${name}`)
      if (!entry) continue
      unknownKeys(entry, ['description'], `tools.${name}`)
      const description = text(entry.description, `tools.${name}.description`, PROMPT_LIMITS.description)
      if (description !== undefined) tools[name] = description
    }
  }

  const rootGuide = text(raw.rootGuide, 'rootGuide', PROMPT_LIMITS.rootGuide)
  const rootNote = text(raw.rootNote, 'rootNote', PROMPT_LIMITS.rootNote)

  const groups: ResolvedPrompts['groups'] = {}
  const groupsRaw = section(raw.groups, 'groups')
  if (groupsRaw) {
    for (const [name, value] of Object.entries(groupsRaw)) {
      if (!(ACTION_GROUPS as readonly string[]).includes(name)) { warn('unknown-group', `groups.${name}`, `groups.${name}: no such group (groups: ${ACTION_GROUPS.join(', ')}); ignored`); continue }
      const entry = section(value, `groups.${name}`)
      if (!entry) continue
      unknownKeys(entry, ['summary'], `groups.${name}`)
      const summary = text(entry.summary, `groups.${name}.summary`, PROMPT_LIMITS.summary)
      if (summary !== undefined) groups[name as ActionGroup] = summary
    }
  }

  const actions: ResolvedPrompts['actions'] = {}
  const actionsRaw = section(raw.actions, 'actions')
  if (actionsRaw) {
    for (const [name, value] of Object.entries(actionsRaw)) {
      if (!findAction(name) && !findSubAction(name) && !findTopic(name)) { warn('unknown-action', `actions.${name}`, `actions.${name}: no such action, sub-action or detail topic; ignored`); continue }
      const entry = section(value, `actions.${name}`)
      if (!entry) continue
      unknownKeys(entry, ['summary', 'notes'], `actions.${name}`)
      const summary = text(entry.summary, `actions.${name}.summary`, PROMPT_LIMITS.summary)
      const topicOnly = !findAction(name) && !findSubAction(name)
      const notes = text(entry.notes, `actions.${name}.notes`, topicOnly ? PROMPT_LIMITS.topicText : PROMPT_LIMITS.notes)
      if (summary !== undefined || notes !== undefined) actions[name] = { ...summary !== undefined ? { summary } : {}, ...notes !== undefined ? { notes } : {} }
    }
  }

  const errorHints: ResolvedPrompts['errorHints'] = {}
  const hintsRaw = section(raw.errorHints, 'errorHints')
  if (hintsRaw) {
    for (const [code, value] of Object.entries(hintsRaw)) {
      if (!(ERROR_CODES as readonly string[]).includes(code)) { warn('unknown-error-code', `errorHints.${code}`, `errorHints.${code}: not an error code; ignored`); continue }
      if (!OVERRIDABLE_ERROR_CODES.includes(code)) { warn('not-overridable', `errorHints.${code}`, `errorHints.${code}: this code has no fixed hint to replace (overridable: ${OVERRIDABLE_ERROR_CODES.join(', ')}); ignored`); continue }
      const hint = text(value, `errorHints.${code}`, PROMPT_LIMITS.errorHint)
      if (hint !== undefined) errorHints[code] = hint
    }
  }

  const skill: ResolvedPrompts['skill'] = { enabled: true }
  const skillRaw = section(raw.skill, 'skill')
  if (skillRaw) {
    unknownKeys(skillRaw, ['enabled', 'description', 'bodyFile', 'append'], 'skill')
    if (skillRaw.enabled !== undefined && skillRaw.enabled !== null) {
      if (typeof skillRaw.enabled !== 'boolean') warn('invalid-type', 'skill.enabled', 'skill.enabled must be true or false; ignored')
      else { skill.enabled = skillRaw.enabled; if (!skill.enabled) applied.push({ key: 'skill.enabled' }) }
    }
    const description = text(skillRaw.description, 'skill.description', PROMPT_LIMITS.skillDescription)
    if (description !== undefined) skill.description = description
    const append = text(skillRaw.append, 'skill.append', PROMPT_LIMITS.skillAppend)
    if (append !== undefined) skill.append = append
    if (skillRaw.bodyFile !== undefined && skillRaw.bodyFile !== null) {
      if (typeof skillRaw.bodyFile !== 'string') warn('invalid-type', 'skill.bodyFile', 'skill.bodyFile must be a string; ignored')
      else if (skillRaw.bodyFile.trim() !== '') {
        if (!path.isAbsolute(skillRaw.bodyFile)) warn('relative-body-file', 'skill.bodyFile', 'skill.bodyFile must be an absolute path; the packaged body is used')
        else { skill.bodyFile = skillRaw.bodyFile; applied.push({ key: 'skill.bodyFile', length: skillRaw.bodyFile.length }) }
      }
    }
  }

  const empty = !Object.keys(tools).length && rootGuide === undefined && rootNote === undefined && !Object.keys(groups).length
    && !Object.keys(actions).length && !Object.keys(errorHints).length && applied.length === 0
  if (empty && diagnostics.length === 0) return NO_PROMPTS
  return {
    tools, ...rootGuide !== undefined ? { rootGuide } : {}, ...rootNote !== undefined ? { rootNote } : {},
    groups, actions, errorHints, skill, applied, diagnostics,
  }
}

/** A live view of the configured overrides. `current()` re-reads the config each time, so a change applies to the next call. */
export interface PromptsSource {
  current(): ResolvedPrompts
}

/**
 * Wrap a reader of the raw `prompts` value. The result is cached by the identity of what the reader returns, so
 * an unchanged config costs nothing per call while a changed one (a volatile reference holds a new snapshot after
 * every write) is validated again.
 */
export function promptsSource(read: () => unknown): PromptsSource {
  let last: unknown
  let resolved: ResolvedPrompts | undefined
  return {
    current() {
      const raw = read()
      if (resolved === undefined || raw !== last) { last = raw; resolved = resolvePrompts(raw) }
      return resolved
    },
  }
}

/** A source that never overrides anything. */
export const NO_PROMPTS_SOURCE: PromptsSource = { current: () => NO_PROMPTS }

// --- defaults, in the shape of the configuration ---------------------------------------------------------------

/** The sub-actions and detail topics of an action, as the keys `prompts.actions` addresses them by. */
function* promptTargets(): Generator<{ key: string; summary: string; notes: string }> {
  for (const action of ACTIONS) {
    yield { key: action.name, summary: action.summary, notes: action.notes ?? '' }
    for (const [sub, def] of Object.entries(action.subActions?.items ?? {})) yield { key: `${action.name}.${sub}`, summary: def.summary, notes: def.notes ?? '' }
    for (const [topic, def] of Object.entries(action.topics ?? {})) yield { key: `${action.name}.${topic}`, summary: def.summary, notes: def.text }
  }
}

/**
 * Every overridable text with its built-in value, in the exact structure of the `prompts` configuration. Pasted back
 * as the configuration it changes nothing (a blank `notes`, `rootNote` or `append` means "none"), which makes it the
 * starting point for editing: delete what stays default, reword the rest.
 */
export function defaultPrompts(): Record<string, unknown> {
  const skill = readSkill()
  return {
    tools: {
      browser_index: { description: DEFAULT_INDEX_DESCRIPTION },
      browser_call: { description: DEFAULT_CALL_DESCRIPTION },
    },
    rootGuide: COMPACT_GUIDE,
    rootNote: '',
    groups: Object.fromEntries(ACTION_GROUPS.map(group => [group, { summary: GROUP_SUMMARIES[group] }])),
    actions: Object.fromEntries([...promptTargets()].map(target => [target.key, { summary: target.summary, notes: target.notes }])),
    errorHints: { ...DEFAULT_ERROR_HINTS },
    skill: { enabled: true, description: skill.description, bodyFile: '', append: '' },
  }
}

// --- budget and status -----------------------------------------------------------------------------------------

const tokensOf = (chars: number): number => Math.round(chars / CHARS_PER_TOKEN)

export interface PromptBudget {
  /** Estimated tokens of the two L0 tools (name + description + parameters, as the host sends them). */
  l0Tokens: number
  l0Budget: number
  layerBudget: number
  /** The largest browser_index layer (root, a group, an action, a sub-action or a topic). */
  largestLayer: { name: string; tokens: number }
  /** Every layer over the per-layer budget. */
  overBudget: { name: string; tokens: number }[]
}

export interface BudgetEnvironment {
  mode: AutomationMode
  options: ExposureOptions
  enabled: boolean
}

/** Measure the L0 tools and every browser_index layer under these overrides. */
export function measurePromptBudget(prompts: ResolvedPrompts, environment: BudgetEnvironment): PromptBudget {
  const l0Chars = indexedToolDefinitions(prompts.tools).reduce((sum, tool) => sum + JSON.stringify(tool).length, 0)
  const env = (skillAvailable: boolean): IndexEnvironment => ({ mode: environment.mode, options: environment.options, enabled: environment.enabled, skillAvailable, prompts })
  const layers: { name: string; tokens: number }[] = [
    { name: 'root', tokens: tokensOf(renderIndex({}, env(false)).text.length) },
    { name: 'root (skill present)', tokens: tokensOf(renderIndex({}, env(true)).text.length) },
  ]
  for (const group of ACTION_GROUPS) layers.push({ name: group, tokens: tokensOf(renderIndex({ group }, env(true)).text.length) })
  for (const target of promptTargets()) layers.push({ name: target.key, tokens: tokensOf(renderIndex({ action: target.key }, env(true)).text.length) })
  const largest = layers.reduce((best, layer) => layer.tokens > best.tokens ? layer : best)
  return {
    l0Tokens: tokensOf(l0Chars), l0Budget: L0_BUDGET_TOKENS, layerBudget: LAYER_BUDGET_TOKENS,
    largestLayer: largest, overBudget: layers.filter(layer => layer.tokens > LAYER_BUDGET_TOKENS),
  }
}

export interface PromptsStatus {
  /** The overrides in force, by key and length. */
  overrides: AppliedPrompt[]
  /** Everything ignored or worth a warning, including budget overruns. */
  diagnostics: PromptDiagnostic[]
  budget: PromptBudget
  skill: { enabled: boolean; body: 'packaged' | 'file'; bodyFile?: string }
}

/** What `runtime.status` reports under `prompts`, and the settings panel shows. Reads the live configuration. */
export function describePrompts(config: { prompts?: PromptsSource } & BudgetEnvironment): PromptsStatus {
  const prompts = config.prompts?.current() ?? NO_PROMPTS
  const diagnostics: PromptDiagnostic[] = [...prompts.diagnostics]
  const budget = measurePromptBudget(prompts, config)
  if (budget.l0Tokens > L0_BUDGET_TOKENS) diagnostics.push({ level: 'warn', code: 'budget-l0', key: 'tools', message: `the always-on L0 tools are ~${budget.l0Tokens} tokens, over the ${L0_BUDGET_TOKENS} budget` })
  for (const layer of budget.overBudget) diagnostics.push({ level: 'warn', code: 'budget-layer', key: layer.name, message: `browser_index layer "${layer.name}" is ~${layer.tokens} tokens, over the ${LAYER_BUDGET_TOKENS} per-layer budget` })
  let body: 'packaged' | 'file' = 'packaged'
  if (prompts.skill.bodyFile) {
    const loaded = loadSkillBodyFile(prompts.skill.bodyFile)
    if (loaded.ok) body = 'file'
    else diagnostics.push({ level: 'warn', code: 'body-file', key: 'skill.bodyFile', message: `${loaded.reason}; the packaged skill body is used` })
  }
  return {
    overrides: [...prompts.applied], diagnostics, budget,
    skill: { enabled: prompts.skill.enabled, body, ...prompts.skill.bodyFile ? { bodyFile: prompts.skill.bodyFile } : {} },
  }
}
