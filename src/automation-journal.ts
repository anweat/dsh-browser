/**
 * Turn a slice of the exploration journal into a v2 recipe draft.
 *
 * The journal is evidence of one exploration, not a trusted recording (the same rule the recording notes in
 * docs/browser-recipe-migration-and-cancellation.md apply): failed and purely observing calls are left out,
 * an action the recipe cannot express is reported as `unmapped` and keeps the draft from being activated,
 * typed values are never guessed (a value that was not retained becomes a required input), and every
 * judgement the builder made is visible in the report. It does not decide that the draft is equivalent to
 * the exploration; the independent replay (`test` with `inputSets`) is what shows that.
 * @module dsh-browser/automation-journal
 */

import { ActionArgError } from './actions/types.ts'
import type { AutomationAsset } from './automation-assets.ts'
import type { InputSpec, OutputSpec, PendingDisambiguation, Postcondition, BrowserRecipeStepV2 } from './automation-v2.ts'
import type { JournalEntry, SessionJournal } from './journal.ts'
import { redactUrl } from './journal.ts'
import type { BrowserLocatorSpec } from './locator.ts'

export interface JournalParameter { seq: number; field: string; name: string; type?: 'string' | 'number' }
export interface JournalExtract { seq: number; as: string; mode?: 'text' | 'html' | 'links'; limit?: number; dedupe?: boolean }

export interface DraftFromJournalArgs {
  fromSeq?: number
  toSeq?: number
  exclude?: number[]
  parameters?: JournalParameter[]
  extract?: JournalExtract[]
  name: string
  description?: string
  domains?: string[]
  postconditions?: unknown[]
}

export interface JournalWarning { code: string; seq?: number; message: string }

export interface JournalDraftReport {
  fromSeq: number
  toSeq: number
  steps: number
  /** False while any journaled action could not become a step. */
  complete: boolean
  sourceMap: Record<string, number>
  /** Read-only observe calls: kept in the journal as observation points, never steps. */
  observationPoints: number[]
  excluded: { seq: number; reason: string }[]
  unmapped: { seq: number; action: string; reason: string }[]
  inputSchema: InputSpec[]
  pendingDisambiguation: { step: number; seq: number; kind: 'positional-index'; locator: BrowserLocatorSpec }[]
  parameterCandidates: { seq: number; field: string; example: string; suggestedName: string }[]
  extractCandidates: { seq: number; locator?: BrowserLocatorSpec; chars?: number }[]
  suggestedPostconditions: Postcondition[]
  suggestedTestUrl?: string
  domains: string[]
  warnings: JournalWarning[]
}

export interface JournalDraft {
  /** Input for `AutomationDevelopmentService.save`. */
  draft: Partial<AutomationAsset> & Pick<AutomationAsset, 'kind' | 'name'>
  report: JournalDraftReport
}

const NAME = /^[a-zA-Z][\w-]{0,39}$/
const MAX_STEPS = 25
const PARAM_FIELDS: Record<string, string> = { 'act.fill': 'text', 'act.type': 'text', 'act.select': 'values', 'target.open': 'url' }

function slug(value: string | undefined): string {
  const text = (value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 24)
  return /^[a-z]/.test(text) ? text : ''
}

function suggestedName(entry: JournalEntry): string {
  const locator = entry.locator
  return slug(locator?.label ?? locator?.name ?? locator?.testId ?? (locator?.css?.match(/#([\w-]+)/)?.[1])) || 'input'
}

function hostOf(url: string | undefined): string | undefined {
  if (!url) return undefined
  try {
    const parsed = new URL(url)
    return ['http:', 'https:'].includes(parsed.protocol) ? parsed.hostname.toLowerCase() : undefined
  } catch { return undefined }
}

function isRef(value: unknown): value is { ref: string; length: number; sensitive?: boolean } {
  return !!value && typeof value === 'object' && typeof (value as { ref?: unknown }).ref === 'string'
}

/** An atomic-action locator as a v2 recipe locator, or the reason it cannot be one. */
function recipeLocator(locator: BrowserLocatorSpec | undefined): { ok: true; value?: Record<string, unknown> } | { ok: false; reason: string } {
  if (!locator) return { ok: true }
  const { frame, selector, explicitFirst: _first, ...rest } = locator as BrowserLocatorSpec & { explicitFirst?: boolean }
  const out: Record<string, unknown> = { ...rest }
  if (selector !== undefined && out.css === undefined) out.css = selector
  if (frame) {
    if (!frame.selector) return { ok: false, reason: 'the locator picks its iframe by name or url, which v2 steps cannot express (they take framePath, iframe CSS selectors)' }
    out.framePath = [frame.selector]
  }
  return { ok: true, value: out }
}

export function buildDraftFromJournal(journal: SessionJournal, args: DraftFromJournalArgs): JournalDraft {
  const all = journal.entries()
  if (all.length === 0) throw new ActionArgError('the journal of this session is empty: nothing was explored through browser_call yet', 'Explore first (target.open, observe.read, act.*), then call draft_from_journal.')
  const fromSeq = args.fromSeq ?? all[0]!.seq
  const toSeq = args.toSeq ?? all[all.length - 1]!.seq
  if (fromSeq > toSeq) throw new ActionArgError(`fromSeq ${fromSeq} is after toSeq ${toSeq}`)
  const range = all.filter(entry => entry.seq >= fromSeq && entry.seq <= toSeq)
  if (range.length === 0) throw new ActionArgError(`no journal entry between seq ${fromSeq} and ${toSeq}`, `The journal holds seq ${all[0]!.seq}-${all[all.length - 1]!.seq}.`)
  const bySeq = new Map(range.map(entry => [entry.seq, entry]))
  const warnings: JournalWarning[] = []
  if (journal.dropped > 0 && args.fromSeq !== undefined && args.fromSeq < all[0]!.seq) warnings.push({ code: 'JOURNAL_TRUNCATED', message: `the journal keeps the last ${journal.limit} calls; seq before ${all[0]!.seq} were dropped, so the draft may start mid-exploration` })

  // Arguments that name a seq must name one that is in the range.
  const known = (seq: number, what: string): JournalEntry => {
    const entry = bySeq.get(seq)
    if (!entry) throw new ActionArgError(`${what} names seq ${seq}, which is not in the selected range ${fromSeq}-${toSeq}`, `Journal entries in range: ${range.map(item => item.seq).join(', ')}.`)
    return entry
  }
  const excludeSet = new Set<number>()
  for (const seq of args.exclude ?? []) { known(seq, 'exclude'); excludeSet.add(seq) }
  const lifted = new Map<number, { name: string; type: 'string' | 'number' }>()
  const names = new Map<string, 'string' | 'number'>()
  for (const parameter of args.parameters ?? []) {
    const entry = known(parameter.seq, 'parameters')
    const field = PARAM_FIELDS[entry.action]
    if (!field) throw new ActionArgError(`parameters: seq ${parameter.seq} is ${entry.action}, which has no value to turn into an input`, 'Parameters apply to act.fill, act.type (field "text"), act.select (field "values") and a later target.open (field "url").')
    if (parameter.field !== field) throw new ActionArgError(`parameters: ${entry.action} (seq ${parameter.seq}) has the field "${field}", not "${parameter.field}"`)
    if (!NAME.test(parameter.name)) throw new ActionArgError(`parameters: name "${parameter.name}" must start with a letter and use letters, digits, _ or - (max 40)`)
    if (lifted.has(parameter.seq)) throw new ActionArgError(`parameters: seq ${parameter.seq} is listed twice`)
    const type = parameter.type ?? 'string'
    if (names.has(parameter.name) && names.get(parameter.name) !== type) throw new ActionArgError(`parameters: ${parameter.name} is declared with two types`)
    names.set(parameter.name, type)
    lifted.set(parameter.seq, { name: parameter.name, type })
  }
  const extracts = new Map<number, JournalExtract>()
  for (const extract of args.extract ?? []) {
    const entry = known(extract.seq, 'extract')
    if (entry.action !== 'observe.read') throw new ActionArgError(`extract: seq ${extract.seq} is ${entry.action}; only an observe.read can become an extract step`, 'Read the part of the page you want (observe.read with a locator), then name that seq here.')
    const sections = entry.params.sections
    if (Array.isArray(sections) && !sections.includes('content')) throw new ActionArgError(`extract: seq ${extract.seq} did not read the page text (sections ${JSON.stringify(sections)}); extract needs the content section`)
    if (!NAME.test(extract.as)) throw new ActionArgError(`extract: as "${extract.as}" must start with a letter and use letters, digits, _ or - (max 40)`)
    if ([...extracts.values()].some(other => other.as === extract.as)) throw new ActionArgError(`extract: output name "${extract.as}" is used twice`)
    extracts.set(extract.seq, extract)
  }

  const steps: BrowserRecipeStepV2[] = []
  const sourceMap: Record<string, number> = {}
  const excluded: JournalDraftReport['excluded'] = []
  const observationPoints: number[] = []
  const unmapped: JournalDraftReport['unmapped'] = []
  const inputs = new Map<string, InputSpec>()
  const candidates: JournalDraftReport['parameterCandidates'] = []
  const pending: JournalDraftReport['pendingDisambiguation'] = []
  const included: JournalEntry[] = []
  let startUrl: string | undefined
  let primaryTarget: string | undefined
  const usedNames = new Set(names.keys())
  const autoName = (entry: JournalEntry, sensitive: boolean): string => {
    const base = sensitive ? 'secret' : suggestedName(entry)
    let name = base
    for (let n = 2; usedNames.has(name) || inputs.has(name); n += 1) name = `${base}${n}`
    usedNames.add(name)
    return name
  }
  const addInput = (spec: InputSpec): void => { if (!inputs.has(spec.name)) inputs.set(spec.name, spec) }
  const includedSeqs0 = (): Set<number> => new Set(included.map(entry => entry.seq))
  const push = (entry: JournalEntry, step: BrowserRecipeStepV2): void => {
    steps.push(step)
    sourceMap[String(entry.seq)] = steps.length
    included.push(entry)
    if (step.locator?.index !== undefined) pending.push({ step: steps.length, seq: entry.seq, kind: 'positional-index', locator: structuredClone(step.locator) as BrowserLocatorSpec })
  }
  const skip = (entry: JournalEntry, reason: string): void => { unmapped.push({ seq: entry.seq, action: entry.action, reason }) }

  for (const entry of range) {
    if (excludeSet.has(entry.seq)) { excluded.push({ seq: entry.seq, reason: 'excluded by the caller' }); continue }
    if (!entry.outcome.ok) {
      excluded.push({ seq: entry.seq, reason: `failed: ${entry.outcome.errorCode ?? entry.outcome.executionStatus}` })
      warnings.push({
        code: entry.effects === 'unknown' ? 'FAILED_STEP_EFFECTS_UNKNOWN' : 'FAILED_STEP_EXCLUDED', seq: entry.seq,
        message: `seq ${entry.seq} (${entry.action}) failed with ${entry.outcome.errorCode ?? entry.outcome.executionStatus} and was left out; the draft assumes the later steps did not depend on it${entry.effects === 'unknown' ? ' (it may have changed the page before failing)' : ''}`,
      })
      continue
    }
    if (entry.action === 'target.close') { excluded.push({ seq: entry.seq, reason: 'session control, not a page step' }); continue }
    if (entry.observation) {
      const extract = extracts.get(entry.seq)
      if (!extract) { observationPoints.push(entry.seq); continue }
      const located = recipeLocator(entry.locator)
      if (!located.ok) { skip(entry, located.reason); continue }
      push(entry, { type: 'extract', ...located.value ? { locator: located.value as never } : {}, mode: extract.mode ?? 'text', ...extract.limit !== undefined ? { limit: extract.limit } : {}, as: extract.as })
      continue
    }
    if (entry.action === 'target.select') { skip(entry, 'switching between pages (target.select): a v2 recipe runs on one page'); continue }
    if (['script.evaluate', 'script.run_builtin', 'script.run_userscript'].includes(entry.action)) { skip(entry, 'page script cannot be a recipe step; reuse it as a userscript asset instead'); continue }
    if (entry.action.startsWith('script.')) { skip(entry, 'script actions are not recipe steps'); continue }
    if (entry.action === 'act.upload') { skip(entry, 'file upload is not a v2 recipe step'); continue }
    if (entry.action === 'automation.run_recipe' || entry.action === 'automation.run') { skip(entry, 'a whole recipe or asset was run here; save that recipe directly instead of recording it'); continue }
    if (entry.targetId !== undefined) {
      primaryTarget ??= entry.targetId
      if (entry.targetId !== primaryTarget) { skip(entry, `ran on page ${entry.targetId}, not ${primaryTarget}: a v2 recipe runs on one page`); continue }
    }
    const located = recipeLocator(entry.locator)
    if (!located.ok) { skip(entry, located.reason); continue }
    const locator = located.value as never
    const timeout = typeof entry.params.timeoutMs === 'number' && entry.params.timeoutMs >= 1 && entry.params.timeoutMs <= 30_000 ? { timeoutMs: entry.params.timeoutMs } : {}
    switch (entry.action) {
      case 'target.open': {
        const raw = typeof entry.params.url === 'string' ? entry.params.url : undefined
        if (!raw || redactUrl(raw).url !== raw || raw.includes('%5Bredacted%5D')) { skip(entry, 'the URL carried a secret (userinfo or a token in the query), which is not kept; pass the page url when testing'); break }
        const first = startUrl === undefined && steps.length === 0
        if (first) {
          if (lifted.has(entry.seq)) throw new ActionArgError(`parameters: seq ${entry.seq} is the opening page; the start url is already an argument of test and run`)
          startUrl = raw
          included.push(entry)
          sourceMap[String(entry.seq)] = 0
          break
        }
        const lift = lifted.get(entry.seq)
        if (lift) { addInput({ name: lift.name, type: lift.type, required: true, example: raw }); push(entry, { type: 'goto', url: `{{${lift.name}}}` }) }
        else {
          push(entry, { type: 'goto', url: raw })
          candidates.push({ seq: entry.seq, field: 'url', example: raw, suggestedName: 'url' })
        }
        break
      }
      case 'act.click': push(entry, { type: 'click', locator, ...timeout }); break
      case 'act.hover': push(entry, { type: 'hover', locator, ...timeout }); break
      case 'act.clear': push(entry, { type: 'clear', locator, ...timeout }); break
      case 'act.check': push(entry, { type: 'check', locator, ...entry.params.checked === false ? { checked: false } : {}, ...timeout }); break
      case 'act.press': push(entry, { type: 'press', key: String(entry.params.key), ...locator ? { locator } : {}, ...timeout }); break
      case 'act.scroll': push(entry, { type: 'scroll', deltaY: typeof entry.params.deltaY === 'number' ? entry.params.deltaY : 2000 }); break
      case 'act.fill':
      case 'act.type': {
        const type = entry.action === 'act.fill' ? 'fill' : 'type'
        const ref = entry.params.text
        const raw = isRef(ref) ? journal.rawText(entry.seq) : undefined
        const lift = lifted.get(entry.seq)
        if (lift) {
          if (lift.type === 'number' && raw !== undefined && !Number.isFinite(Number(raw))) throw new ActionArgError(`parameters: seq ${entry.seq} typed a value that is not a number, so it cannot be a number input`)
          addInput({ name: lift.name, type: lift.type, required: true, ...raw !== undefined && raw !== '' ? { example: lift.type === 'number' ? Number(raw) : raw } : {}, ...isRef(ref) && ref.sensitive ? { description: 'sensitive: pass at run time' } : {} })
          push(entry, { type, locator, value: `{{${lift.name}}}`, ...timeout })
        } else if (raw !== undefined) {
          if (raw === '') push(entry, { type: 'fill', locator, value: '', allowEmpty: true, ...timeout })
          else {
            push(entry, { type, locator, value: raw, ...timeout })
            candidates.push({ seq: entry.seq, field: 'text', example: raw, suggestedName: suggestedName(entry) })
          }
        } else {
          // The value was not retained (secret-looking, or too long): it cannot be a literal, so it becomes a required input.
          const sensitive = isRef(ref) && ref.sensitive === true
          const name = autoName(entry, sensitive)
          addInput({ name, type: 'string', required: true, description: sensitive ? 'sensitive: pass at run time' : 'value too long to keep; pass at run time' })
          push(entry, { type, locator, value: `{{${name}}}`, ...timeout })
          warnings.push({ code: sensitive ? 'SENSITIVE_VALUE_BECAME_INPUT' : 'VALUE_BECAME_INPUT', seq: entry.seq, message: `seq ${entry.seq}: the typed value was ${sensitive ? 'sensitive' : 'too long'} and is not stored; the draft takes it as the required input "${name}"` })
        }
        break
      }
      case 'act.select': {
        const values = Array.isArray(entry.params.values) ? entry.params.values : []
        if (values.length !== 1) { skip(entry, 'selecting several options at once: v2 select takes one value'); break }
        const value = values[0]
        const lift = lifted.get(entry.seq)
        if (lift) { addInput({ name: lift.name, type: lift.type, required: true, ...typeof value === 'string' ? { example: lift.type === 'number' ? Number(value) : value } : {} }); push(entry, { type: 'select', locator, value: `{{${lift.name}}}`, ...timeout }) }
        else if (typeof value === 'string') { push(entry, { type: 'select', locator, value, ...timeout }); candidates.push({ seq: entry.seq, field: 'values', example: value, suggestedName: suggestedName(entry) }) }
        else {
          const name = autoName(entry, false)
          addInput({ name, type: 'string', required: true, description: 'value not kept; pass at run time' })
          push(entry, { type: 'select', locator, value: `{{${name}}}`, ...timeout })
        }
        break
      }
      case 'act.wait': {
        const p = entry.params
        if (locator) {
          if (p.state !== undefined && p.state !== 'visible') { skip(entry, `waiting for state "${String(p.state)}": v2 wait only waits for a visible element`); break }
          push(entry, { type: 'wait', condition: 'locator', locator, ...timeout })
        } else if (typeof p.urlPattern === 'string') {
          if (/[*?{}[\]]/.test(p.urlPattern)) { skip(entry, 'a glob URL pattern: v2 wait url matches by substring; wait for the page text or add an assert urlIncludes'); break }
          push(entry, { type: 'wait', condition: 'url', value: p.urlPattern, ...timeout })
        } else if (p.networkIdle === true) push(entry, { type: 'wait', condition: 'load', ...timeout })
        else if (typeof p.timeMs === 'number') {
          push(entry, { type: 'wait', condition: 'time', waitMs: p.timeMs })
          warnings.push({ code: 'FIXED_DELAY', seq: entry.seq, message: `seq ${entry.seq}: a fixed ${p.timeMs} ms delay was copied; replace it with a wait for an element or text` })
        } else skip(entry, 'a wait condition v2 cannot express')
        break
      }
      default:
        skip(entry, `${entry.action} has no recipe step`)
    }
  }

  for (const seq of lifted.keys()) if (!includedSeqs0().has(seq)) warnings.push({ code: 'PARAMETER_NOT_APPLIED', seq, message: `parameters names seq ${seq}, which is not a step in the draft (failed, excluded or unmapped), so that input was not declared` })
  for (const seq of extracts.keys()) if (!includedSeqs0().has(seq)) warnings.push({ code: 'EXTRACT_NOT_APPLIED', seq, message: `extract names seq ${seq}, which is not a step in the draft` })

  // Which steps did the exploration really run in sequence? A page that moved between two calls on its own is worth knowing about.
  const lastOnTarget = new Map<string, JournalEntry>()
  for (const entry of range) {
    if (entry.targetId === undefined) continue
    const before = lastOnTarget.get(entry.targetId)
    if (before && before.generationAfter !== undefined && entry.generationBefore !== undefined && before.generationAfter !== entry.generationBefore) {
      warnings.push({ code: 'GENERATION_JUMP', seq: entry.seq, message: `the page moved from generation ${before.generationAfter} (after seq ${before.seq}) to ${entry.generationBefore} (before seq ${entry.seq}) without a recorded action: it navigated or re-rendered on its own; the draft may need a wait or a goto there` })
    }
    lastOnTarget.set(entry.targetId, entry)
  }
  const includedSeqs = new Set(included.map(entry => entry.seq))
  for (const entry of range) {
    if (includedSeqs.has(entry.seq) || entry.observation) continue
    const navigated = entry.generationAfter !== undefined && (entry.generationBefore === undefined || entry.generationAfter > entry.generationBefore)
    if (navigated && entry.outcome.ok === false && entry.effects === 'none') continue
    if (navigated && ['target.open', 'act.click', 'act.press'].includes(entry.action)) {
      warnings.push({ code: 'EXCLUDED_NAVIGATION', seq: entry.seq, message: `seq ${entry.seq} (${entry.action}) navigated the page but is not a step in the draft, and no goto replaces it` })
    }
  }

  if (steps.length === 0) {
    throw new ActionArgError(
      `no step could be drafted from seq ${fromSeq}-${toSeq}${unmapped.length ? `; ${unmapped.length} action(s) are unmapped (${unmapped.slice(0, 3).map(item => `seq ${item.seq}: ${item.reason}`).join('; ')})` : ''}`,
      'Widen the range, or write the recipe yourself with automation.develop save.',
    )
  }
  if (steps.length > MAX_STEPS) throw new ActionArgError(`the selection makes ${steps.length} steps; a recipe holds at most ${MAX_STEPS}`, 'Narrow it with fromSeq/toSeq or exclude repeated steps.')

  // Domains: what the exploration touched, unless the caller says.
  const hosts = new Set<string>()
  for (const entry of included) {
    const host = hostOf(entry.url)
    if (host) hosts.add(host)
  }
  for (const step of steps) if (step.type === 'goto' && !step.url!.includes('{{')) { const host = hostOf(step.url); if (host) hosts.add(host) }
  const startHost = hostOf(startUrl)
  if (startHost) hosts.add(startHost)
  const domains = args.domains?.length ? args.domains.map(domain => domain.toLowerCase()) : [...hosts]
  if (domains.length === 0) throw new ActionArgError('no domain could be derived from the journal: pass domains', 'The draft needs the hostnames it may run on, for example ["example.com"].')

  // Where a test has to start.
  let suggestedTestUrl = startUrl
  if (suggestedTestUrl === undefined) {
    const firstIncluded = included[0]!
    const before = [...all].reverse().find(entry => entry.seq < firstIncluded.seq && entry.url)
    suggestedTestUrl = before?.url
    warnings.push({ code: 'NO_OPENING_STEP', message: `the selection has no opening target.open, so the draft starts on whatever page the test url loads${suggestedTestUrl ? `; the page before seq ${firstIncluded.seq} was ${suggestedTestUrl}` : ''}` })
  }

  // Outputs and what could verify them.
  const extractSteps = steps.filter(step => step.type === 'extract')
  const outputSchema: OutputSpec[] = extractSteps.map(step => {
    const source = [...extracts.values()].find(extract => extract.as === step.as)!
    return { name: step.as!, type: step.mode === 'links' ? 'json' : 'string', ...source.dedupe ? { dedupe: true as const } : {} }
  })
  const extractCandidates: JournalDraftReport['extractCandidates'] = range
    .filter(entry => entry.observation && entry.action === 'observe.read' && entry.outcome.ok && entry.locator && !extracts.has(entry.seq))
    .map(entry => ({ seq: entry.seq, locator: entry.locator!, ...entry.size !== undefined ? { chars: entry.size } : {} }))
  if (extractSteps.length === 0) warnings.push({ code: 'NO_OUTPUT', message: extractCandidates.length ? 'the draft has no extract step, so it returns nothing; pass extract:[{seq, as}] for one of extractCandidates' : 'the draft has no extract step, so it returns nothing; read the result with observe.read (locator) and name it in extract' })

  const suggestedPostconditions: Postcondition[] = []
  const lastExtract = [...included].reverse().find(entry => entry.observation)
  if (lastExtract) {
    const name = steps[sourceMap[String(lastExtract.seq)]! - 1]!.as!
    suggestedPostconditions.push(lastExtract.size === 0 ? { output: name, allowEmpty: true } : { output: name, nonEmpty: true })
  }
  const lastUrl = included.length ? included[included.length - 1]!.url : undefined
  if (lastUrl && startUrl) {
    try {
      const now = new URL(lastUrl)
      const start = new URL(startUrl)
      if (now.pathname !== start.pathname) suggestedPostconditions.push({ urlIncludes: now.pathname })
    } catch { /* not comparable */ }
  }

  const postconditions = args.postconditions
  if (!postconditions?.length && !steps.some(step => step.type === 'assert')) {
    warnings.push({ code: 'NO_VERIFIER', message: 'the draft has no postcondition or assert, so its test cannot pass (VALIDATION_MISSING); pass postconditions (see suggestedPostconditions) when you call draft_from_journal again with id' })
  }

  const inputSchema = [...inputs.values()]
  const report: JournalDraftReport = {
    fromSeq, toSeq, steps: steps.length, complete: unmapped.length === 0, sourceMap, observationPoints, excluded, unmapped, inputSchema,
    pendingDisambiguation: pending, parameterCandidates: candidates, extractCandidates, suggestedPostconditions,
    ...suggestedTestUrl ? { suggestedTestUrl } : {}, domains, warnings,
  }
  if (!report.complete) warnings.push({ code: 'INCOMPLETE_DRAFT', message: `${unmapped.length} journaled action(s) could not become steps (see unmapped); the draft cannot be activated until you finish the recipe and save it yourself` })
  return {
    draft: {
      kind: 'recipe', schemaVersion: 2, name: args.name,
      description: args.description ?? `Drafted from exploration journal seq ${fromSeq}-${toSeq}.`,
      domains, recipe: steps,
      ...inputSchema.length ? { inputSchema } : {}, ...outputSchema.length ? { outputSchema } : {},
      ...postconditions?.length ? { postconditions: postconditions as Postcondition[] } : {},
      origin: { kind: 'journal', fromSeq, toSeq, unmapped: unmapped.length },
    },
    report,
  }
}

export type { PendingDisambiguation }
