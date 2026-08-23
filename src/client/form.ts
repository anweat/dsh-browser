import type { SettingsScope, SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'

export type SettingField =
  | 'enabled' | 'automationMode' | 'browserRuntime' | 'channel' | 'headless' | 'opencliEnabled'
  | 'usagePolicy' | 'automationAssets' | 'autoInstall' | 'storageStatePath' | 'authProfiles' | 'defaultAuthProfile'
  | 'rulePacks' | 'executablePath' | 'snapshotDir' | 'verbose'

export interface CardFieldState {
  text: string
  overridden: boolean
  invalid: boolean
}

export interface BrowserCardState {
  available: boolean
  writable: boolean
  dirty: boolean
  invalid: boolean
  saving: boolean
  failed: boolean
  fields: Record<SettingField, CardFieldState>
}

type FieldWrite = { kind: 'set'; value: unknown } | { kind: 'clear' }
export interface FieldSpec {
  field: SettingField
  format(value: unknown): string
  parse(text: string): FieldWrite | undefined
}
interface Draft { text: string; clear: boolean }

const textField = (field: SettingField): FieldSpec => ({
  field,
  format: value => typeof value === 'string' ? value : '',
  parse(text) { return text.trim() === '' ? { kind: 'clear' } : { kind: 'set', value: text.trim() } },
})

const booleanField = (field: SettingField): FieldSpec => ({
  field,
  format: value => value === true ? 'true' : 'false',
  parse: text => text === 'true' || text === 'false' ? { kind: 'set', value: text === 'true' } : undefined,
})

const enumField = (field: SettingField, values: readonly string[]): FieldSpec => ({
  field,
  format: value => typeof value === 'string' ? value : values[0] ?? '',
  parse: text => values.includes(text) ? { kind: 'set', value: text } : undefined,
})

const jsonField = (field: SettingField, validate?: (value: Record<string, unknown>) => boolean): FieldSpec => ({
  field,
  format: value => value && typeof value === 'object' && !Array.isArray(value) ? JSON.stringify(value, null, 2) : '',
  parse(text) {
    if (text.trim() === '') return { kind: 'clear' }
    try {
      const value = JSON.parse(text) as unknown
      if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
      const record = value as Record<string, unknown>
      return validate && !validate(record) ? undefined : { kind: 'set', value: record }
    } catch { return undefined }
  },
})

const POLICY_BOUNDS: Record<string, readonly [number, number]> = {
  minDelayMs: [0, 60_000], maxConcurrency: [1, 8], burst: [1, 20], maxPagesPerRun: [1, 100],
  maxDepth: [0, 5], retryLimit: [0, 5], backoffBaseMs: [1, 60_000], cooldownMs: [100, 300_000],
}

const ASSET_POLICY_KEYS = new Set([
  'enabled', 'directory', 'persistenceMode', 'activationMode', 'minSuccessfulRuns', 'minDistinctSessions',
  'successWindowDays', 'minSuccessRate', 'maxCandidates', 'candidateTtlDays', 'maxSuggestionsPerDay',
  'maxDrafts', 'maxActiveAssets', 'retrievalTopK', 'catalogTokenBudget',
])

function validAssetPolicy(value: Record<string, unknown>): boolean {
  if (Object.keys(value).some(key => !ASSET_POLICY_KEYS.has(key))) return false
  if (value.enabled !== undefined && typeof value.enabled !== 'boolean') return false
  if (value.directory !== undefined && typeof value.directory !== 'string') return false
  if (value.persistenceMode !== undefined && !['off', 'manual', 'suggest', 'auto-draft'].includes(String(value.persistenceMode))) return false
  if (value.activationMode !== undefined && !['manual', 'auto-tested'].includes(String(value.activationMode))) return false
  return Object.entries(value).every(([key, entry]) => {
    if (!['minSuccessfulRuns', 'minDistinctSessions', 'successWindowDays', 'minSuccessRate', 'maxCandidates', 'candidateTtlDays', 'maxSuggestionsPerDay', 'maxDrafts', 'maxActiveAssets', 'retrievalTopK', 'catalogTokenBudget'].includes(key)) return true
    return typeof entry === 'number' && Number.isFinite(entry) && entry >= 0
  })
}

function validUsagePolicy(value: Record<string, unknown>): boolean {
  if (Object.keys(value).some(key => !(key in POLICY_BOUNDS))) return false
  return Object.entries(POLICY_BOUNDS).every(([key, [min, max]]) => {
    const entry = value[key]
    return entry === undefined || (typeof entry === 'number' && Number.isInteger(entry) && entry >= min && entry <= max)
  })
}

export const FIELD_SPECS: readonly FieldSpec[] = [
  booleanField('enabled'),
  enumField('automationMode', ['read-only', 'standard', 'autonomous', 'unrestricted']),
  enumField('browserRuntime', ['playwright', 'patchright']),
  textField('channel'),
  booleanField('headless'),
  booleanField('opencliEnabled'),
  jsonField('usagePolicy', validUsagePolicy),
  jsonField('automationAssets', validAssetPolicy),
  booleanField('autoInstall'),
  textField('storageStatePath'),
  jsonField('authProfiles'),
  textField('defaultAuthProfile'),
  jsonField('rulePacks'),
  textField('executablePath'),
  textField('snapshotDir'),
  booleanField('verbose'),
] as const

const SPEC_BY_FIELD = new Map(FIELD_SPECS.map(spec => [spec.field, spec]))

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => `${JSON.stringify(key)}:${stable(entry)}`).join(',')}}`
  }
  return JSON.stringify(value)
}

function same(left: unknown, right: unknown): boolean { return stable(left) === stable(right) }

function createLocalStore<T>(initial: T): SnapshotStore<T> {
  let snapshot = initial
  const listeners = new Set<() => void>()
  return {
    getSnapshot: () => snapshot,
    subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener) } },
    set(next) { snapshot = next; for (const listener of listeners) listener() },
    update(updater) { const draft = structuredClone(snapshot); updater(draft); snapshot = draft; for (const listener of listeners) listener() },
  }
}

export class BrowserSettingsController {
  private readonly staged = new Map<SettingField, Draft>()
  private readonly store: SnapshotStore<BrowserCardState>
  private readonly unsubscribe: () => void
  private saving = false
  private failed = false

  constructor(private readonly scope: SettingsScope<Record<string, unknown>>) {
    this.store = createLocalStore(this.project())
    this.unsubscribe = scope.subscribe(() => { this.publish() })
  }

  inject() {
    return {
      hooks: { browserSettings: this.store },
      edit: (field: SettingField, text: string) => { this.edit(field, text) },
      resetField: (field: SettingField) => { this.resetField(field) },
      save: () => { void this.save() },
      discard: () => { this.discard() },
    }
  }

  snapshot(): BrowserCardState { return this.store.getSnapshot() }

  edit(field: SettingField, text: string): void {
    this.staged.set(field, { text, clear: false })
    this.failed = false
    this.publish()
  }

  resetField(field: SettingField): void {
    const spec = this.spec(field)
    this.staged.set(field, { text: spec.format(this.baseValue(field)), clear: true })
    this.failed = false
    this.publish()
  }

  discard(): void { this.staged.clear(); this.failed = false; this.publish() }

  async save(): Promise<void> {
    const plan = this.plan()
    if (this.saving || plan.some(item => item.write === undefined) || plan.length === 0) return
    this.saving = true
    this.failed = false
    this.publish()
    let landed = true
    try {
      for (const item of plan) {
        if (!item.write) { landed = false; break }
        if (item.write.kind === 'clear') {
          await this.scope.unset(item.field)
          landed = !this.stored(item.field) && landed
        } else {
          await this.scope.set(item.field, item.write.value)
          landed = same(this.userLayer()?.[item.field], item.write.value) && landed
        }
      }
    } catch { landed = false }
    if (landed) this.staged.clear()
    this.saving = false
    this.failed = !landed
    this.publish()
  }

  dispose(): void { this.unsubscribe() }

  private project(): BrowserCardState {
    const fields = {} as Record<SettingField, CardFieldState>
    for (const spec of FIELD_SPECS) fields[spec.field] = this.field(spec.field)
    const plan = this.plan()
    return {
      available: this.scope.getSnapshot().status === 'ready', writable: this.scope.getSnapshot().writable,
      dirty: plan.length > 0, invalid: plan.some(item => item.write === undefined), saving: this.saving, failed: this.failed, fields,
    }
  }

  private field(field: SettingField): CardFieldState {
    const spec = this.spec(field)
    const draft = this.staged.get(field)
    if (!draft) return { text: spec.format(this.sectionValue(field)), overridden: this.stored(field), invalid: false }
    const write = draft.clear ? { kind: 'clear' as const } : spec.parse(draft.text)
    return { text: draft.text, overridden: write?.kind === 'set', invalid: write === undefined }
  }

  private plan(): { field: SettingField; write: FieldWrite | undefined }[] {
    const writes: { field: SettingField; write: FieldWrite | undefined }[] = []
    for (const [field, draft] of this.staged) {
      const spec = this.spec(field)
      if (draft.clear) { if (this.stored(field)) writes.push({ field, write: { kind: 'clear' } }); continue }
      if (draft.text === spec.format(this.sectionValue(field))) continue
      writes.push({ field, write: spec.parse(draft.text) })
    }
    return writes
  }

  private spec(field: SettingField): FieldSpec {
    const spec = SPEC_BY_FIELD.get(field)
    if (!spec) throw new Error(`unknown browser settings field: ${field}`)
    return spec
  }
  private sectionValue(field: SettingField): unknown { return this.scope.getSnapshot().value?.[field] }
  private baseValue(field: SettingField): unknown { return (this.scope.getSnapshot().base as Record<string, unknown> | undefined)?.[field] }
  private userLayer(): Record<string, unknown> | undefined { return this.scope.getSnapshot().user as Record<string, unknown> | undefined }
  private stored(field: SettingField): boolean { const user = this.userLayer(); return user !== undefined && Object.hasOwn(user, field) }
  private publish(): void { this.store.set(this.project()) }
}
