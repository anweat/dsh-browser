/**
 * Bounded, auditable Playwright recipes for model-generated browser flows.
 * Recipes deliberately expose named operations instead of arbitrary JavaScript.
 * @module dsh-browser/automation
 */

import { RecipeAssertionError, RecipeValidationError, abortedByDeadline, isTimeoutError, mapError, neverReachedElement } from './actions/errors.ts'
import type { ErrorCode } from './actions/types.ts'
import type { LocatorAmbiguity } from './locator.ts'
import {
  assertGotoAllowed, coerceOutput, evaluatePostconditions, runStepV2, validateRecipeV2,
  type BrowserRecipeStepV2, type RecipeV2Options,
} from './automation-v2.ts'

export const WAIT_CONDITIONS = ['selector', 'text', 'load', 'time'] as const
export const EXTRACT_MODES = ['text', 'html', 'links', 'attribute'] as const

export type BrowserRecipeStep =
  | { type: 'wait'; condition: 'selector' | 'text' | 'load' | 'time'; value?: string; waitMs?: number; timeoutMs?: number }
  | { type: 'click'; selector: string; timeoutMs?: number }
  | { type: 'fill'; selector: string; value: string; timeoutMs?: number }
  | { type: 'type'; selector: string; value: string; timeoutMs?: number }
  | { type: 'press'; key: string; selector?: string }
  | { type: 'select'; selector: string; value: string }
  | { type: 'check'; selector: string; checked?: boolean }
  | { type: 'hover'; selector: string }
  | { type: 'scroll'; deltaY?: number; waitMs?: number }
  | { type: 'extract'; selector?: string; mode?: 'text' | 'html' | 'links' | 'attribute'; attribute?: string; limit?: number }
  | { type: 'assert'; selector?: string; text?: string; timeoutMs?: number }
  | { type: 'screenshot' }

/** Every step type a run can report: v1 and v2 names. */
export type RecipeStepType = BrowserRecipeStep['type'] | BrowserRecipeStepV2['type']
/** A step of either schema version; `schemaVersion` of the asset (or run) says which. */
export type AnyRecipeStep = BrowserRecipeStep | BrowserRecipeStepV2

export interface RecipeStepResult {
  step: number
  action: RecipeStepType
  ok: boolean
  /** For extract and screenshot steps: the index of this step's value in `outputs`. The value itself is stored once, there. */
  output?: number
}

export type RecipeExecutionStatus = 'completed' | 'failed' | 'cancelled' | 'outcome_unknown'
export type RecipeValidationStatus = 'not_checked' | 'passed' | 'failed'
export type RecipeEffects = 'none' | 'observed' | 'unknown'

export interface RecipeFailedStep {
  /** 1-based, the same numbering as {@link RecipeStepResult.step}. */
  index: number
  action: RecipeStepType | 'userscript' | 'postcondition'
  errorCode: ErrorCode
  /** The original Playwright or service message, unchanged. */
  message: string
  /** For LOCATOR_AMBIGUOUS: the first matches, so the locator can be made unique. */
  candidates?: LocatorAmbiguity
}

export interface RecipeOutput {
  step: number
  action: 'extract' | 'screenshot'
  /** v2 `extract` with `as`: the output's name. */
  name?: string
  /** The extracted text or screenshot path; typed (number, parsed JSON) when the asset's outputSchema says so. */
  value: unknown
}

/**
 * What a recipe run did. Execution and validation are separate axes: steps can
 * all run (`completed`) while an assert still failed (`validationStatus: failed`).
 * A failure is a value, not an exception, so the steps that already ran and
 * the side effects they caused are never lost.
 */
export interface RecipeRunResult {
  executionStatus: RecipeExecutionStatus
  /** `passed` only when the recipe has assert steps and every one of them ran and held. */
  validationStatus: RecipeValidationStatus
  /** The steps that finished, in the original per-step format. */
  completedSteps: RecipeStepResult[]
  /** The step that failed, or the step a cancel/deadline stopped before. Absent when everything ran. */
  failedStep?: RecipeFailedStep
  /** Whether state-changing steps (fill, type, click, press, select, check) took effect. */
  effects: RecipeEffects
  /** Values produced by extract and screenshot steps; `completedSteps[].output` points into this array. */
  outputs: RecipeOutput[]
  /** One-line summary of why the run is not `completed`. */
  message?: string
  /** An unknown extract mode ran through the pre-B2 `links` branch (stored v1 assets only). */
  legacyFallback?: true
}

export interface RunRecipeOptions extends RecipeV2Options {
  /** Stored v1 assets keep their old behaviour for an unknown extract mode instead of being rejected. */
  legacy?: boolean
  /** 2: steps use LocatorSpec (strict), goto/clear exist, and postconditions/outputSchema apply. Default 1 (`.first()`, selectors). */
  schemaVersion?: 1 | 2
}

/** Steps that never change page or remote state. `goto` is navigation limited to the recipe's domains, like target.open. */
export const READ_ONLY_ACTIONS = new Set<string>(['wait', 'extract', 'assert', 'screenshot', 'goto'])
/** Steps that change page or remote state. A failure here may have partly taken effect. */
const EFFECT_ACTIONS = new Set<string>(['fill', 'clear', 'type', 'click', 'press', 'select', 'check'])

function finite(value: number | undefined, fallback: number, min: number, max: number, label: string): number {
  const resolved = value ?? fallback
  if (!Number.isFinite(resolved) || resolved < min || resolved > max) throw new Error(label + ' must be between ' + min + ' and ' + max)
  return resolved
}

function selector(value: string | undefined): string {
  if (!value || value.length > 500) throw new Error('selector must contain 1 to 500 characters')
  return value
}

function shortText(value: string | undefined, label: string, max = 20_000): string {
  if (value === undefined || value.length === 0 || value.length > max) throw new Error(label + ' must contain 1 to ' + max + ' characters')
  return value
}

/**
 * Reject enum values the runner does not implement. Used by `validateRecipe`
 * and by the asset store when a draft is saved, so an unknown value never
 * reaches storage.
 */
export function validateRecipeEnums(steps: readonly BrowserRecipeStep[], options: RunRecipeOptions = {}): void {
  steps.forEach((step, index) => {
    const label = 'recipe step ' + (index + 1)
    if (step?.type === 'wait' && !(WAIT_CONDITIONS as readonly unknown[]).includes(step.condition)) throw new RecipeValidationError(label + ': unsupported wait condition ' + JSON.stringify(step.condition) + '; use one of ' + WAIT_CONDITIONS.join(', '))
    if (!options.legacy && step?.type === 'extract' && step.mode !== undefined && !(EXTRACT_MODES as readonly unknown[]).includes(step.mode)) throw new RecipeValidationError(label + ': unsupported extract mode ' + JSON.stringify(step.mode) + '; use one of ' + EXTRACT_MODES.join(', '))
  })
}

/** Extract steps whose mode is not in the enum; they ran as `links` before enum validation existed. */
function hasLegacyExtractMode(steps: readonly BrowserRecipeStep[]): boolean {
  return steps.some(step => step.type === 'extract' && step.mode !== undefined && !(EXTRACT_MODES as readonly unknown[]).includes(step.mode))
}

export function validateRecipe(steps: readonly BrowserRecipeStep[], options: RunRecipeOptions = {}): void {
  try {
    validateRecipeShape(steps, options)
  } catch (error) {
    throw error instanceof RecipeValidationError ? error : new RecipeValidationError(error instanceof Error ? error.message : String(error))
  }
}

function validateRecipeShape(steps: readonly BrowserRecipeStep[], options: RunRecipeOptions): void {
  if (steps.length < 1 || steps.length > 25) throw new Error('recipe must contain between 1 and 25 steps')
  // A stored v1 asset may carry an unknown extract mode; it keeps running through the old branch.
  if (!options.legacy) validateRecipeEnums(steps)
  else for (const step of steps) if (step.type === 'wait') validateRecipeEnums([step])
  for (const step of steps) {
    switch (step.type) {
      case 'wait': {
        if (!(WAIT_CONDITIONS as readonly unknown[]).includes(step.condition)) throw new Error('unsupported wait condition')
        finite(step.timeoutMs, 15_000, 1, 30_000, 'wait timeoutMs')
        if (step.condition === 'selector') selector(step.value)
        else if (step.condition === 'text') shortText(step.value, 'wait text', 2_000)
        else if (step.condition === 'time') finite(step.waitMs ?? Number(step.value ?? 0), 0, 0, 10_000, 'wait waitMs')
        break
      }
      case 'click':
        selector(step.selector)
        finite(step.timeoutMs, 15_000, 1, 30_000, 'click timeoutMs')
        break
      case 'fill':
      case 'type':
        selector(step.selector)
        shortText(step.value, step.type + ' value')
        finite(step.timeoutMs, 15_000, 1, 30_000, step.type + ' timeoutMs')
        break
      case 'press':
        shortText(step.key, 'key', 100)
        if (step.selector !== undefined) selector(step.selector)
        break
      case 'select':
        selector(step.selector)
        shortText(step.value, 'select value', 2_000)
        break
      case 'check':
      case 'hover':
        selector(step.selector)
        break
      case 'scroll':
        finite(step.deltaY, 2_000, -20_000, 20_000, 'scroll deltaY')
        finite(step.waitMs, 400, 0, 5_000, 'scroll waitMs')
        break
      case 'extract':
        if (step.selector !== undefined) selector(step.selector)
        finite(step.limit, 100, 1, 500, 'extract limit')
        if (step.mode === 'attribute') shortText(step.attribute, 'attribute', 100)
        break
      case 'assert':
        if (step.selector === undefined && step.text === undefined) throw new Error('assert requires selector or text')
        if (step.selector !== undefined) selector(step.selector)
        if (step.text !== undefined) shortText(step.text, 'assert text', 2_000)
        finite(step.timeoutMs, 15_000, 1, 30_000, 'assert timeoutMs')
        break
      case 'screenshot':
        break
      default:
        throw new Error('unsupported recipe step')
    }
  }
}

export function recipeNeedsApproval(steps: readonly AnyRecipeStep[]): boolean {
  return steps.some(step => !READ_ONLY_ACTIONS.has(step.type))
}

function cap(value: string, max = 50_000): string {
  return value.length <= max ? value : value.slice(0, max) + '\n…(truncated)'
}

/** Run one step against the page. Returns the value an extract or screenshot step produced. */
async function runStep(page: any, step: BrowserRecipeStep, captureScreenshot: () => Promise<string>): Promise<string | undefined> {
  switch (step.type) {
    case 'wait': {
      const timeout = finite(step.timeoutMs, 15_000, 1, 30_000, 'wait timeoutMs')
      if (step.condition === 'selector') await page.locator(selector(step.value)).first().waitFor({ state: 'visible', timeout })
      else if (step.condition === 'text') await page.getByText(shortText(step.value, 'wait text', 2_000), { exact: false }).first().waitFor({ state: 'visible', timeout })
      else if (step.condition === 'load') await page.waitForLoadState('networkidle', { timeout })
      else await page.waitForTimeout(finite(step.waitMs ?? Number(step.value ?? 0), 0, 0, 10_000, 'wait waitMs'))
      return undefined
    }
    case 'click':
      await page.locator(selector(step.selector)).first().click({ timeout: step.timeoutMs ?? 15_000 })
      return undefined
    case 'fill':
      await page.locator(selector(step.selector)).first().fill(step.value, { timeout: step.timeoutMs ?? 15_000 })
      return undefined
    case 'type':
      await page.locator(selector(step.selector)).first().pressSequentially(step.value, { timeout: step.timeoutMs ?? 15_000 })
      return undefined
    case 'press':
      if (step.selector) await page.locator(selector(step.selector)).first().press(step.key)
      else await page.keyboard.press(step.key)
      return undefined
    case 'select':
      await page.locator(selector(step.selector)).first().selectOption(step.value)
      return undefined
    case 'check': {
      const target = page.locator(selector(step.selector)).first()
      if (step.checked === false) await target.uncheck()
      else await target.check()
      return undefined
    }
    case 'hover':
      await page.locator(selector(step.selector)).first().hover()
      return undefined
    case 'scroll':
      await page.mouse.wheel(0, step.deltaY ?? 2_000)
      await page.waitForTimeout(step.waitMs ?? 400)
      return undefined
    case 'extract': {
      // A missing element times out in innerText (LOCATOR_NOT_FOUND); an element that exists but is empty yields '' and the step completes.
      const target = page.locator(step.selector ?? 'body').first()
      const mode = step.mode ?? 'text'
      if (mode === 'text') return cap(await target.innerText())
      if (mode === 'html') return cap(await target.innerHTML())
      if (mode === 'attribute') return String(await target.getAttribute(shortText(step.attribute, 'attribute', 100)) ?? '')
      // `links`, and any unknown mode of a stored v1 asset (legacyFallback).
      const rows = await target.locator('a[href]').evaluateAll((anchors: any[], limit: number) => anchors.slice(0, limit).map(anchor => ({
        text: String(anchor.textContent ?? '').trim(),
        url: String(anchor.href ?? ''),
      })), step.limit ?? 100)
      return cap(JSON.stringify(rows))
    }
    case 'assert': {
      const timeout = step.timeoutMs ?? 15_000
      try {
        if (step.selector) await page.locator(selector(step.selector)).first().waitFor({ state: 'visible', timeout })
        if (step.text) await page.getByText(step.text, { exact: false }).first().waitFor({ state: 'visible', timeout })
      } catch (error) {
        // Only "never became true" is a failed assertion; a closed page or a bad selector keeps its own cause.
        if (!isTimeoutError(error)) throw error
        const expected = [step.selector ? 'selector ' + JSON.stringify(step.selector) : '', step.text ? 'text ' + JSON.stringify(step.text) : ''].filter(Boolean).join(' and ')
        throw new RecipeAssertionError('assert failed: ' + expected + ' did not become visible within ' + timeout + 'ms. ' + (error instanceof Error ? error.message : String(error)))
      }
      return undefined
    }
    case 'screenshot':
      return captureScreenshot()
  }
}

/**
 * Run the steps in order and report what happened as a value.
 *
 * Cancellation is checked before every step and once more after the last one.
 * A step already running cannot be interrupted (Playwright offers no way to do
 * that without closing the page), so a cancel takes effect when that step
 * returns; nothing is rolled back. A malformed recipe still throws
 * {@link RecipeValidationError} before any step runs.
 */
export async function runRecipe(
  page: any,
  steps: readonly AnyRecipeStep[],
  captureScreenshot: () => Promise<string>,
  signal?: AbortSignal,
  options: RunRecipeOptions = {},
): Promise<RecipeRunResult> {
  const v2 = options.schemaVersion === 2
  if (v2) {
    // Nothing runs when a goto leaves the allowed domains or a step is malformed.
    assertGotoAllowed(steps as readonly BrowserRecipeStepV2[], options)
    validateRecipeV2(steps as readonly BrowserRecipeStepV2[])
  } else validateRecipe(steps as readonly BrowserRecipeStep[], options)
  const completedSteps: RecipeStepResult[] = []
  const outputs: RecipeOutput[] = []
  const postconditions = v2 ? options.postconditions ?? [] : []
  const verifiers = steps.filter(step => step.type === 'assert').length + postconditions.length
  let verified = 0
  let validationFailed = false
  let effectsObserved = false
  let effectsUnknown = false
  const legacyFallback = !v2 && options.legacy === true && hasLegacyExtractMode(steps as readonly BrowserRecipeStep[])

  const finish = (executionStatus: RecipeExecutionStatus, failedStep?: RecipeFailedStep, message?: string): RecipeRunResult => ({
    executionStatus,
    validationStatus: validationFailed ? 'failed' : (verifiers > 0 && verified === verifiers ? 'passed' : 'not_checked'),
    completedSteps,
    ...failedStep ? { failedStep } : {},
    effects: effectsUnknown ? 'unknown' : (effectsObserved ? 'observed' : 'none'),
    outputs,
    ...message ? { message } : {},
    ...legacyFallback ? { legacyFallback: true as const } : {},
  })

  /** A stop requested from outside: the user cancelled, or the overall deadline expired. */
  const stopped = (index: number | undefined): RecipeRunResult => {
    const byDeadline = abortedByDeadline(signal)
    const where = index === undefined ? 'after the last step' : 'before step ' + (index + 1) + ' (' + steps[index]!.type + ')'
    const message = (byDeadline ? 'The overall deadline expired ' : 'Cancelled ') + where + '; ' + completedSteps.length + ' of ' + steps.length + ' steps ran and are not rolled back.'
    const failedStep: RecipeFailedStep | undefined = index === undefined ? undefined
      : { index: index + 1, action: steps[index]!.type, errorCode: byDeadline ? 'DEADLINE' : 'CANCELLED', message }
    return finish(byDeadline ? 'failed' : 'cancelled', failedStep, message)
  }

  for (let index = 0; index < steps.length; index += 1) {
    if (signal?.aborted) return stopped(index)
    const step = steps[index]!
    let value: string | undefined
    try {
      value = v2
        ? await runStepV2(page, step as BrowserRecipeStepV2, { ...options, captureScreenshot })
        : await runStep(page, step as BrowserRecipeStep, captureScreenshot)
    } catch (error) {
      const body = mapError(error, 'recipe.step', { signal })
      const effectful = EFFECT_ACTIONS.has(step.type)
      if (step.type === 'assert' && body.code === 'VALIDATION_FAILED') validationFailed = true
      // The element was never found (or the locator was ambiguous / the step malformed): the action did not start, so nothing happened.
      const neverStarted = body.code === 'LOCATOR_AMBIGUOUS' || body.code === 'INVALID_RECIPE' || neverReachedElement(error)
      // Otherwise the action may have partly happened.
      if (effectful && !neverStarted) effectsUnknown = true
      const failedStep: RecipeFailedStep = { index: index + 1, action: step.type, errorCode: body.code, message: body.message, ...body.candidates ? { candidates: body.candidates } : {} }
      const summary = 'Step ' + (index + 1) + ' (' + step.type + ') failed with ' + body.code + '; ' + completedSteps.length + ' earlier steps ran and are not rolled back.'
      if (body.code === 'CANCELLED') return finish('cancelled', failedStep, summary)
      if (effectful && isTimeoutError(error) && !neverStarted) return finish('outcome_unknown', failedStep, summary + ' The side-effecting step timed out, so its outcome is unknown.')
      return finish('failed', failedStep, summary + (effectful && neverStarted ? ' The step did not start (no element was acted on), so it had no effect.' : ''))
    }
    if (EFFECT_ACTIONS.has(step.type)) effectsObserved = true
    if (step.type === 'assert') verified += 1
    const produced = value !== undefined && (step.type === 'extract' || step.type === 'screenshot')
    if (produced) {
      const name = v2 && step.type === 'extract' ? (step as BrowserRecipeStepV2).as : undefined
      outputs.push({ step: index + 1, action: step.type as 'extract' | 'screenshot', ...name ? { name } : {}, value: value! })
    }
    completedSteps.push({ step: index + 1, action: step.type, ok: true, ...produced ? { output: outputs.length - 1 } : {} })
  }
  if (signal?.aborted) return stopped(undefined)

  if (v2) {
    // Declared output types: a value that does not convert is a validation failure, not an execution failure.
    const problems: string[] = []
    for (const spec of options.outputSchema ?? []) {
      const output = outputs.find(entry => entry.name === spec.name)
      if (!output) continue
      const converted = coerceOutput(spec, output.value)
      if (converted.ok) output.value = converted.value
      else problems.push(converted.problem)
    }
    const checked = await evaluatePostconditions(page, postconditions, outputs, signal)
    if (checked.error !== undefined) {
      const body = mapError(checked.error, 'recipe.postcondition', { signal })
      const failedStep: RecipeFailedStep = { index: steps.length + 1, action: 'postcondition', errorCode: body.code, message: body.message }
      return finish(body.code === 'CANCELLED' ? 'cancelled' : 'failed', failedStep, 'A postcondition could not be checked (' + body.code + '); the steps themselves ran and are not rolled back.')
    }
    if (signal?.aborted) return stopped(undefined)
    verified += postconditions.length - checked.failures.length
    const failures = [...problems, ...checked.failures]
    if (failures.length) {
      validationFailed = true
      const message = failures.join(' | ')
      return finish('completed', { index: steps.length + 1, action: 'postcondition', errorCode: 'VALIDATION_FAILED', message }, 'All ' + steps.length + ' steps ran, but ' + failures.length + ' of the recipe\'s postconditions or output types did not hold, so the result is not confirmed.')
    }
  }
  return finish('completed')
}
