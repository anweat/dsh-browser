/**
 * Action dispatch: validate arguments, check availability, run the executor
 * under a deadline, and wrap everything in the result envelope.
 *
 * Both tool surfaces call {@link runAction}, so the envelope and the error
 * codes are identical whether the model reaches an action through
 * `browser_call` or through a flat per-action tool.
 * @module dsh-browser/actions/run
 */

import { outcomeOf, type ActionContext, type ActionEnvelope, type ActionErrorBody, type ExecutionStatus } from './types.ts'
import { ACTIONS, findAction, traitsFor } from './registry.ts'
import { actionUnavailableReason, type AutomationMode, type ExposureOptions } from '../freedom.ts'
import { compactSchema, validateArgs } from './schema.ts'
import { targetOf } from './shared.ts'
import { DeadlineError, abortedByDeadline, hintFor, mapError } from './errors.ts'
import { effectsOf, isJournaled, isObservation, redactUrl, scrubCall, summarize, type JournalEntry, type SessionJournal } from '../journal.ts'

/** Serialized-result cap; larger results get their longest strings shortened. */
export const RESULT_CHAR_LIMIT = 100_000

export interface RunEnvironment {
  mode: AutomationMode
  options: ExposureOptions
  enabled: boolean
}

function failure(action: string, executionStatus: ExecutionStatus, error: ActionErrorBody): ActionEnvelope {
  return { ok: false, action, executionStatus, error }
}

/** Normalize an executor's return value into an object result. */
function asResult(value: unknown): Record<string, unknown> {
  // A JSON round trip drops `undefined` members, which the Host's lossless-JSON output check would reject.
  const plain = JSON.parse(JSON.stringify(value ?? null)) as unknown
  if (plain !== null && typeof plain === 'object' && !Array.isArray(plain)) return plain as Record<string, unknown>
  if (Array.isArray(plain)) return { items: plain }
  return { value: plain }
}

/**
 * Shorten the longest string fields until the serialized result fits. The
 * result stays valid JSON; the envelope reports how much text was dropped.
 */
export function truncateResult(result: Record<string, unknown>, limit = RESULT_CHAR_LIMIT): { result: Record<string, unknown>; truncation?: { omitted: number; reason: string } } {
  if (JSON.stringify(result).length <= limit) return { result }
  let omitted = 0
  const copy = structuredClone(result)
  const strings: { holder: Record<string, unknown> | unknown[]; key: string | number; length: number }[] = []
  const walk = (value: unknown): void => {
    if (Array.isArray(value)) value.forEach((entry, index) => { if (typeof entry === 'string') strings.push({ holder: value, key: index, length: entry.length }); else walk(entry) })
    else if (value && typeof value === 'object') {
      for (const [key, entry] of Object.entries(value)) {
        if (typeof entry === 'string') strings.push({ holder: value as Record<string, unknown>, key, length: entry.length })
        else walk(entry)
      }
    }
  }
  walk(copy)
  strings.sort((a, b) => b.length - a.length)
  for (const slot of strings) {
    const size = JSON.stringify(copy).length
    if (size <= limit) break
    const text = (slot.holder as Record<string | number, string>)[slot.key]!
    const excess = size - limit
    const keep = Math.max(200, text.length - excess - 80)
    if (keep >= text.length) continue
    omitted += text.length - keep
    ;(slot.holder as Record<string | number, string>)[slot.key] = text.slice(0, keep) + '…[truncated]'
  }
  return { result: copy, truncation: { omitted, reason: `result exceeded ${limit} characters; longest text fields were shortened` } }
}

function withDeadline<T>(run: (signal: AbortSignal) => Promise<T>, timeoutMs: number, parent: AbortSignal, settleMs = 0): Promise<{ timedOut: false; value: T } | { timedOut: true }> {
  const controller = new AbortController()
  const onAbort = (): void => controller.abort(parent.reason)
  if (parent.aborted) controller.abort(parent.reason)
  else parent.addEventListener('abort', onAbort, { once: true })
  const work = run(controller.signal).then(value => ({ timedOut: false as const, value }))
  // If the deadline wins, the work may still reject later; swallow it.
  work.catch(() => {})
  let timer: ReturnType<typeof setTimeout> | undefined
  let settleTimer: ReturnType<typeof setTimeout> | undefined
  const deadline = new Promise<{ timedOut: true }>(resolve => {
    timer = setTimeout(() => {
      controller.abort(new DeadlineError('deadline'))
      // A cooperative executor gets a bounded window to stop at its next safe point; if it returns inside the window, `work` wins the race below.
      if (settleMs > 0) settleTimer = setTimeout(() => resolve({ timedOut: true }), settleMs)
      else resolve({ timedOut: true })
    }, timeoutMs)
  })
  return Promise.race([work, deadline]).finally(() => {
    clearTimeout(timer)
    clearTimeout(settleTimer)
    parent.removeEventListener('abort', onAbort)
  })
}

// --- exploration journal ---------------------------------------------------------

interface JournalCall {
  args: Record<string, unknown>
  before?: { targetId?: string; generation?: number; url?: string }
  sensitiveControl: boolean
}

/** The session's journal, when the service keeps one (test doubles of the service may not). */
function journalOf(ctx: ActionContext): SessionJournal | undefined {
  try { return ctx.service.journalFor?.(ctx.session) } catch { return undefined }
}

/** Note the page the call is about to act on. Never fails the call. */
async function beginJournal(name: string, args: Record<string, unknown>, ctx: ActionContext): Promise<JournalCall> {
  const call: JournalCall = { args, sensitiveControl: false }
  try {
    call.before = ctx.service.pageStamp?.(ctx.session)
    // A typed value's sensitivity depends on the control (type=password...), which only the page knows, and only before the call.
    if (name === 'act.fill' || name === 'act.type') {
      const target = targetOf(args as { selector?: unknown; locator?: unknown }, false)
      if (target !== undefined && ctx.service.inputSensitivity) call.sensitiveControl = await ctx.service.inputSensitivity(target, { session: ctx.session })
    }
  } catch { /* the journal is evidence, not a precondition */ }
  return call
}

/** Record the finished call and return its seq (undefined for a call refused for its arguments: it never touched the page). Never fails the call. */
function finishJournal(journal: SessionJournal, call: JournalCall, name: string, mutating: boolean, envelope: ActionEnvelope, ctx: ActionContext): number | undefined {
  try {
    if (envelope.error?.code === 'INVALID_ARGS') return undefined
    const seq = journal.allocate()
    const after = ctx.service.pageStamp?.(ctx.session)
    const scrubbed = scrubCall(name, call.args, seq, call.sensitiveControl)
    const outcome: JournalEntry['outcome'] = { ok: envelope.ok, executionStatus: envelope.executionStatus, ...envelope.error ? { errorCode: envelope.error.code } : {} }
    const observation = isObservation(name)
    const targetId = name === 'target.select' ? after?.targetId ?? call.before?.targetId : call.before?.targetId ?? after?.targetId
    const url = after?.url ? redactUrl(after.url).url : undefined
    const text = envelope.result?.text
    journal.add({
      seq, action: name,
      ...targetId !== undefined ? { targetId } : {},
      ...call.before?.generation !== undefined ? { generationBefore: call.before.generation } : {},
      ...after?.generation !== undefined ? { generationAfter: after.generation } : {},
      ...scrubbed.locator ? { locator: scrubbed.locator } : {},
      params: scrubbed.params, outcome, effects: effectsOf(mutating, outcome),
      summary: summarize(name, envelope),
      ...observation ? { observation: true as const } : {},
      ...url ? { url } : {},
      ...observation && envelope.ok && typeof text === 'string' ? { size: text.length } : {},
    }, scrubbed.raw)
    return seq
  } catch { return undefined }
}

/**
 * Run one action and return the envelope. Never throws: every failure is a
 * structured error the model can act on.
 */
export async function runAction(name: unknown, rawArgs: unknown, ctx: ActionContext, env: RunEnvironment): Promise<ActionEnvelope> {
  const label = typeof name === 'string' ? name : String(name)
  const action = findAction(name)
  if (!action) {
    const close = typeof name === 'string' ? ACTIONS.filter(candidate => candidate.name.includes(name.split('.').pop() ?? name) || name.includes(candidate.group)).slice(0, 5).map(candidate => candidate.name) : []
    return failure(label, 'failed', {
      code: 'UNKNOWN_ACTION',
      message: `Unknown action: ${label}`,
      hint: `Actions are named group.action. Call browser_index() to list groups${close.length ? `; similar: ${close.join(', ')}` : ''}.`,
    })
  }
  const unavailable = actionUnavailableReason(action, env.mode, env.options, env.enabled)
  if (unavailable) {
    return failure(action.name, 'failed', { code: 'POLICY_DENIED', message: `Action ${action.name} is ${unavailable}`, hint: hintFor('POLICY_DENIED')! })
  }
  const validation = validateArgs(action.params, rawArgs)
  if (!validation.ok) {
    return failure(action.name, 'failed', {
      code: 'INVALID_ARGS',
      message: validation.errors.join('; '),
      hint: 'Fix the arguments to match the schema below and call again.',
      schema: compactSchema(action.name, action.params),
    })
  }
  // The mode may allow some operations of an action and not others (automation.develop: get yes, test no).
  const operationUnavailable = actionUnavailableReason(action, env.mode, env.options, env.enabled, validation.value)
  if (operationUnavailable) {
    return failure(action.name, 'failed', { code: 'POLICY_DENIED', message: `Action ${action.name} is ${operationUnavailable}`, hint: hintFor('POLICY_DENIED')! })
  }
  const traits = traitsFor(action, validation.value)
  if (ctx.signal.aborted) return failure(action.name, 'cancelled', { code: 'CANCELLED', message: 'cancelled before start', hint: hintFor('CANCELLED')! })

  const execute = async (): Promise<ActionEnvelope> => {
    let workSignal: AbortSignal = ctx.signal
    try {
      const outcome = await withDeadline(signal => { workSignal = signal; return action.execute(validation.value, { ...ctx, signal }) }, action.timeoutMs, ctx.signal, action.settleMs)
      if (outcome.timedOut) {
        // The work may still finish after the deadline, so a side-effecting action has an unknown outcome.
        const status: ExecutionStatus = traits.mutating ? 'outcome_unknown' : 'failed'
        return failure(action.name, status, {
          code: 'DEADLINE',
          message: `${action.name} did not finish within ${action.timeoutMs} ms`,
          hint: traits.mutating ? 'Outcome unknown: verify the page state with observe.read before retrying; do not blindly repeat a submit.' : hintFor('DEADLINE')!,
        })
      }
      // A result may carry its own outcome (a recipe that ran and failed still returns its whole report).
      const own = outcomeOf(outcome.value)
      const { result, truncation } = truncateResult(asResult(outcome.value))
      return { ok: own?.ok ?? true, action: action.name, executionStatus: own?.executionStatus ?? 'completed', result, ...own?.error ? { error: own.error } : {}, ...truncation ? { truncation } : {} }
    } catch (error) {
      const body = mapError(error, action.name, { signal: workSignal })
      // The deadline stopped work that had not returned: for a side-effecting action the outcome is unknown.
      if (abortedByDeadline(workSignal) && traits.mutating) return failure(action.name, 'outcome_unknown', { ...body, code: 'DEADLINE', hint: 'Outcome unknown: verify the page state with observe.read before retrying; do not blindly repeat a submit.' })
      return failure(action.name, body.code === 'CANCELLED' ? 'cancelled' : 'failed', body)
    }
  }

  const journaled = isJournaled(action.name) ? journalOf(ctx) : undefined
  const call = journaled ? await beginJournal(action.name, validation.value, ctx) : undefined
  const envelope = await execute()
  if (!journaled || !call) return envelope
  const seq = finishJournal(journaled, call, action.name, traits.mutating, envelope, ctx)
  return seq === undefined ? envelope : { ...envelope, seq }
}
