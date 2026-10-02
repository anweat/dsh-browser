/** Helpers shared by the action group modules. @module dsh-browser/actions/shared */

import type { BrowserLocatorSpec, BrowserTarget } from '../browser-service.ts'
import { ActionArgError } from './types.ts'

export const COMPLIANCE_NOTICE = 'The caller/operator must use this capability according to the target site rules and applicable requirements; dsh-browser only executes the requested browser operation and does not determine whether a particular use is permitted.'

/** Resolve the selector-or-locator pair every element-targeting action accepts. */
export function targetOf(args: { selector?: unknown; locator?: unknown }, required = true): BrowserTarget | undefined {
  if (typeof args.selector === 'string' && args.locator === undefined) return args.selector
  if (args.selector === undefined && args.locator && typeof args.locator === 'object') return args.locator as BrowserLocatorSpec
  if (!required && args.selector === undefined && args.locator === undefined) return undefined
  throw new ActionArgError('provide exactly one of selector or locator', 'Pass either selector (CSS string) or locator (object), not both.')
}

/**
 * Serialize a value for the model with a hard size cap. Values under the cap
 * are returned as-is (so they stay structured); larger ones are replaced by a
 * truncated JSON string and flagged.
 */
export function capJson(value: unknown, limit: number): { value: unknown; truncated: boolean } {
  const raw = JSON.stringify(value)
  if (raw === undefined || raw.length <= limit) return { value, truncated: false }
  return { value: raw.slice(0, limit), truncated: true }
}
