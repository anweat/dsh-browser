/**
 * Pure helpers behind the asset editor: what the editor shows, when it counts as changed, and what the
 * latest test vouches for. No React and no RPC, so they can be unit-tested directly.
 * @module dsh-browser/client/asset-editor
 */

import type { AutomationAsset, TestCredential } from '../automation-assets.ts'

/** The fields a person edits. Everything else (id, revision, hash, status, credentials, counters) is shown, never edited. */
const EDITABLE_KEYS = [
  'kind', 'name', 'description', 'domains', 'tags', 'inputNames', 'schemaVersion', 'recipe', 'source',
  'inputSchema', 'outputSchema', 'postconditions', 'requiredCapabilities',
] as const

/** The saved asset as the editor text starts out: only the editable fields, so a test or a status change never makes it look edited. */
export function editableView(asset: AutomationAsset): Record<string, unknown> {
  const record = asset as unknown as Record<string, unknown>
  return Object.fromEntries(EDITABLE_KEYS.filter(key => record[key] !== undefined).map(key => [key, structuredClone(record[key])]))
}

export function serializeEditable(asset: AutomationAsset): string {
  return JSON.stringify(editableView(asset), null, 2)
}

/** JSON with sorted keys, so reformatting or reordering the text is not an edit. */
export function stableJson(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(entry => stableJson(entry)).join(',') + ']'
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    return '{' + Object.keys(record).sort().map(key => JSON.stringify(key) + ':' + stableJson(record[key])).join(',') + '}'
  }
  return JSON.stringify(value) ?? 'null'
}

/** Whether the editor text differs from the baseline it was loaded from. Text that is not JSON is compared as text. */
export function isDirty(text: string, baseline: string): boolean {
  if (text === baseline) return false
  try { return stableJson(JSON.parse(text)) !== stableJson(JSON.parse(baseline)) } catch { return true }
}

export type ParsedEditor = { ok: true; value: Partial<AutomationAsset> & Pick<AutomationAsset, 'kind' | 'name'> } | { ok: false; message: string }

/** Parse the editor text into something saveable, or say why not. */
export function parseEditor(text: string): ParsedEditor {
  let value: unknown
  try { value = JSON.parse(text) } catch (error) { return { ok: false, message: error instanceof Error ? error.message : String(error) } }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { ok: false, message: 'the editor must hold one JSON object' }
  const record = value as Record<string, unknown>
  if (record.kind !== 'recipe' && record.kind !== 'userscript') return { ok: false, message: 'kind must be "recipe" or "userscript"' }
  if (typeof record.name !== 'string' || !record.name.trim()) return { ok: false, message: 'name must be a non-empty string' }
  return { ok: true, value: record as never }
}

export function shortHash(hash: string | undefined): string { return hash ? hash.slice(0, 8) : '--------' }

export interface CredentialView {
  /** The most recent credential bound to the asset's current revision, if any. */
  current?: TestCredential
  /** The most recent credential of any revision, for display. */
  latest?: TestCredential
  /** The current revision has a passed credential whose hash still matches the asset's content hash. */
  vouches: boolean
}

export function credentialView(asset: AutomationAsset | undefined): CredentialView {
  const credentials = asset?.testCredentials ?? []
  const current = credentials.filter(entry => entry.revision === asset?.revision).at(-1)
  return {
    ...current ? { current } : {}, ...credentials.at(-1) ? { latest: credentials.at(-1)! } : {},
    vouches: !!asset && !!current && current.passed && asset.testStatus === 'passed' && (asset.contentHash === undefined || current.contentHash === asset.contentHash),
  }
}
