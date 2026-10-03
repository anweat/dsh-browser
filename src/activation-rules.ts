/**
 * The input-set requirement of activation, as pure functions over stored data.
 *
 * The store enforces it (`AutomationAssetStore.setStatus`) and the settings card explains it next to the Activate
 * button; both call these, so what the card says is what the store will do. Types only, so the card can bundle it.
 * @module dsh-browser/activation-rules
 */

import type { AutomationAsset, TestCredential } from './automation-assets.ts'

/**
 * How many different input sets the credential's passing test covered: its passed sets, one for a plain single run,
 * and enough for any requirement when it is a `legacy` credential synthesized from data written before input sets
 * existed (so upgrading never strands an already-tested asset).
 */
export function inputSetsCovered(credential: Pick<TestCredential, 'legacy' | 'inputSets'>): number {
  if (credential.legacy) return Number.POSITIVE_INFINITY
  return credential.inputSets ? credential.inputSets.filter(entry => entry.passed).length : 1
}

/** How many inputs the asset declares (typed `inputSchema` for v2, `inputNames` otherwise). Zero means the rule does not apply. */
export function declaredInputs(asset: Pick<AutomationAsset, 'inputSchema' | 'inputNames'>): number {
  return Math.max(asset.inputSchema?.length ?? 0, asset.inputNames?.length ?? 0)
}

export interface InputSetShortfall {
  /** Inputs the asset declares. */
  declared: number
  /** Input sets the activation needs the passing test to have covered. */
  required: number
  /** Input sets the test of the current revision covered. */
  covered: number
}

/** What stands between this asset and activation on input sets, or undefined when nothing does. `credential` is the latest of the current revision. */
export function inputSetShortfall(asset: Pick<AutomationAsset, 'inputSchema' | 'inputNames'>, credential: Pick<TestCredential, 'legacy' | 'inputSets'> | undefined, required: number): InputSetShortfall | undefined {
  const declared = declaredInputs(asset)
  if (declared === 0) return undefined
  const covered = credential ? inputSetsCovered(credential) : 0
  return covered < required ? { declared, required, covered } : undefined
}
