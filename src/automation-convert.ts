/**
 * v1 -> v2 recipe conversion.
 *
 * Converting never edits the source asset: it produces the input for a NEW
 * draft that remembers `sourceAssetId` and `sourceRevision`. A v1 selector took
 * the first match; the draft keeps that behaviour on purpose, marked
 * `explicitFirst`, and lists every such step in `pendingDisambiguation` so the
 * author makes each locator unique (or gives it an index and a reason) before
 * the draft is tested and activated.
 * @module dsh-browser/automation-convert
 */

import { RecipeValidationError } from './actions/errors.ts'
import { EXTRACT_MODES, WAIT_CONDITIONS, type BrowserRecipeStep } from './automation.ts'
import { EXTRACT_MODES_V2, pendingDisambiguation, type BrowserRecipeStepV2, type InputSpec, type PendingDisambiguation } from './automation-v2.ts'
import type { AutomationAsset } from './automation-assets.ts'

export interface ConversionResult {
  /** Input for `AutomationAssetStore.saveDraft` (no id: always a new draft). */
  draft: Pick<AutomationAsset, 'kind' | 'name'> & Partial<AutomationAsset>
  /** Every step that still takes the first match. */
  pendingDisambiguation: PendingDisambiguation[]
  /** What changed in meaning or defaults, and what the author still has to add. */
  notes: string[]
}

function fail(asset: AutomationAsset, reason: string): never {
  throw new RecipeValidationError(`cannot convert asset ${asset.id} (revision ${asset.revision}) to schema v2: ${reason}`)
}

const first = (selector: string) => ({ css: selector, explicitFirst: true as const })

function convertStep(asset: AutomationAsset, step: BrowserRecipeStep, index: number): BrowserRecipeStepV2 {
  const where = `step ${index + 1} (${(step as { type?: unknown }).type})`
  const timeout = (step as { timeoutMs?: number }).timeoutMs !== undefined ? { timeoutMs: (step as { timeoutMs: number }).timeoutMs } : {}
  switch (step.type) {
    case 'wait': {
      if (!(WAIT_CONDITIONS as readonly unknown[]).includes(step.condition)) fail(asset, `${where} has the wait condition ${JSON.stringify(step.condition)}, which no runner supports. Fix or remove it in the source asset first.`)
      if (step.condition === 'selector') return { type: 'wait', condition: 'locator', locator: first(String(step.value)), ...timeout }
      if (step.condition === 'text') return { type: 'wait', condition: 'text', value: step.value, ...timeout }
      if (step.condition === 'time') return { type: 'wait', condition: 'time', waitMs: step.waitMs ?? Number(step.value ?? 0) }
      return { type: 'wait', condition: 'load', ...timeout }
    }
    case 'click':
    case 'hover':
      return { type: step.type, locator: first(step.selector), ...timeout }
    case 'fill':
    case 'type':
      return { type: step.type, locator: first(step.selector), value: step.value, ...timeout }
    case 'press':
      return { type: 'press', key: step.key, ...step.selector !== undefined ? { locator: first(step.selector) } : {} }
    case 'select':
      return { type: 'select', locator: first(step.selector), value: step.value }
    case 'check':
      return { type: 'check', locator: first(step.selector), ...step.checked !== undefined ? { checked: step.checked } : {} }
    case 'scroll':
      return { type: 'scroll', ...step.deltaY !== undefined ? { deltaY: step.deltaY } : {}, ...step.waitMs !== undefined ? { waitMs: step.waitMs } : {} }
    case 'extract': {
      if (step.mode !== undefined && !(EXTRACT_MODES as readonly unknown[]).includes(step.mode)) {
        fail(asset, `${where} has the extract mode ${JSON.stringify(step.mode)}, which is not one of ${EXTRACT_MODES_V2.join(', ')}. The v1 runner silently treated it as "links"; choose the mode you meant in the source asset and convert again.`)
      }
      return {
        type: 'extract',
        ...step.selector !== undefined ? { locator: first(step.selector) } : {},
        ...step.mode !== undefined ? { mode: step.mode } : {},
        ...step.attribute !== undefined ? { attribute: step.attribute } : {},
        ...step.limit !== undefined ? { limit: step.limit } : {},
        ...(step as { timeoutMs?: number }).timeoutMs !== undefined ? timeout : {},
      }
    }
    case 'assert':
      return {
        type: 'assert',
        ...step.selector !== undefined ? { locator: first(step.selector) } : {},
        ...step.text !== undefined ? { text: step.text } : {},
        ...timeout,
      }
    case 'screenshot':
      return { type: 'screenshot' }
    default:
      return fail(asset, `${where} is not a v1 step type.`)
  }
}

/** Convert a stored v1 recipe asset into the input of a new v2 draft. The asset itself is only read. */
export function convertV1ToV2Draft(asset: AutomationAsset): ConversionResult {
  if (asset.kind !== 'recipe') fail(asset, 'only recipe assets have a schema to convert; a userscript has none.')
  if (asset.schemaVersion === 2) fail(asset, 'it is already schema v2.')
  if (!Array.isArray(asset.recipe) || asset.recipe.length === 0) fail(asset, 'it has no recipe steps.')
  const recipe = (asset.recipe as BrowserRecipeStep[]).map((step, index) => convertStep(asset, step, index))
  const pending = pendingDisambiguation(recipe)
  const inputSchema: InputSpec[] = asset.inputNames.map(name => ({ name, type: 'string', required: true }))
  const name = `${asset.name} (v2)`.slice(0, 120)
  const notes: string[] = []
  if (pending.length) notes.push(`${pending.length} step(s) used the first match of a CSS selector in v1. They are marked explicitFirst and still take the first match; make each locator unique (role+name, label, testId, a tighter css) or add index with indexReason, then remove explicitFirst.`)
  notes.push('The draft has no postconditions and may have no assert step: add at least one so a test can verify the business result (a v2 test cannot pass without one).')
  notes.push('v2 defaults differ: extract and assert wait at most 5 s unless a step sets timeoutMs (v1 waited up to 15 s for assert and about 30 s for extract); a fill with an empty value needs allowEmpty.')
  if (asset.inputNames.length) notes.push('Inputs became string inputs in inputSchema; set type number or enum, and example, where that fits.')
  return {
    draft: {
      kind: 'recipe',
      name,
      description: asset.description,
      domains: [...asset.domains],
      tags: [...asset.tags],
      schemaVersion: 2,
      recipe: recipe as never,
      ...inputSchema.length ? { inputSchema } : {},
      sourceAssetId: asset.id,
      sourceRevision: asset.revision,
    },
    pendingDisambiguation: pending,
    notes,
  }
}
