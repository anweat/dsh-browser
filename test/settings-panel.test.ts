import assert from 'node:assert/strict'
import test from 'node:test'
import { registerHooks } from 'node:module'

// The primitives package pulls a chain of client-only runtime deps (React
// styling helpers, workspace paths) that have no place in a Node test run, and
// the card's logic under test is the form model's, not their markup. Stub the
// module with the same surface, mirroring how the other client tests stand in
// for `dsh-tools`.
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === '@deepseek-ai/dsh-client-ui-primitives') {
      return {
        url: 'data:text/javascript,' + encodeURIComponent(`
          export const SettingsForm = () => null
          export const SettingsValueField = () => null
          export const settingsTextField = (field) => ({
            field,
            format: value => typeof value === 'string' ? value : '',
            parse(text) { return text.trim() === '' ? { kind: 'clear' } : { kind: 'set', value: text.trim() } },
          })
          export const settingsNumberField = (field) => ({
            field,
            format: value => typeof value === 'number' && Number.isInteger(value) ? String(value) : '',
            parse(text) {
              if (text.trim() === '') return { kind: 'clear' }
              const value = Number(text)
              return Number.isFinite(value) ? { kind: 'set', value } : undefined
            },
          })
          export class SettingsFormModel {
            constructor(scope, specs) { this.scope = scope; this.specs = new Map(specs.map(s => [s.field, s])); this.staged = new Map(); this.listeners = new Set(); this.baseline = undefined; this.saving = false; this.failed = false }
            bind(project) {
              const self = this
              let snapshot = project()
              const publish = () => { snapshot = project(); for (const l of self.listeners) l() }
              this.publish = publish
              this.unsubscribe = this.scope.subscribe(publish)
              publish()
              return { getSnapshot: () => snapshot, subscribe(l) { self.listeners.add(l); return () => { self.listeners.delete(l) } } }
            }
            shell() {
              const snap = this.scope.getSnapshot()
              const plan = this.plan()
              return { available: snap.status === 'ready', writable: snap.writable, dirty: plan.length > 0, invalid: plan.some(i => i.write === undefined), saving: this.saving, failed: this.failed }
            }
            field(field) {
              const spec = this.specs.get(field)
              const draft = this.staged.get(field)
              if (!draft) return { text: spec.format(this.sectionValue(field)), overridden: this.stored(field), invalid: false }
              const write = draft.clear ? { kind: 'clear' } : spec.parse(draft.text)
              return { text: draft.text, overridden: write?.kind === 'set', invalid: write === undefined }
            }
            actions() {
              return {
                edit: (field, text) => { this.staged.set(field, { text, clear: false }); this.failed = false; this.publish() },
                resetField: (field) => { this.staged.set(field, { text: this.specs.get(field).format(this.baseValue(field)), clear: true }); this.failed = false; this.publish() },
                save: () => { void this.save() },
                discard: () => { this.staged.clear(); this.failed = false; this.publish() },
              }
            }
            async save() {
              const plan = this.plan()
              if (this.saving || plan.length === 0 || plan.some(i => i.write === undefined)) return
              this.saving = true; this.failed = false; this.publish()
              const ops = plan.map(i => i.write.kind === 'clear' ? { op: 'unset', path: [i.field] } : { op: 'set', path: [i.field], value: i.write.value })
              let landed = false
              try { landed = await this.scope.mutate(ops, this.baseline?.revision) } catch { landed = false }
              if (landed) this.staged.clear()
              this.saving = false; this.failed = !landed; this.publish()
            }
            plan() {
              const out = []
              for (const [field, draft] of this.staged) {
                const spec = this.specs.get(field)
                if (draft.clear) { if (this.stored(field)) out.push({ field, write: { kind: 'clear' } }); continue }
                if (draft.text === spec.format(this.sectionValue(field))) continue
                out.push({ field, write: spec.parse(draft.text) })
              }
              return out
            }
            sectionValue(field) { return this.scope.getSnapshot().value?.[field] }
            baseValue(field) { return this.scope.getSnapshot().base?.[field] }
            stored(field) { const user = this.scope.getSnapshot().user; return user !== undefined && Object.hasOwn(user, field) }
            dispose() { this.unsubscribe?.() }
          }
        `),
        shortCircuit: true,
      }
    }
    return nextResolve(specifier, context)
  },
})

const { BrowserSettingsController, FIELD_SPECS, JSON_FIELD_SPECS } = await import('../src/client/form.ts')
const { SETTINGS_NAMESPACE } = await import('../src/client/settings-namespace.ts')
const { Config } = await import('../src/config.ts')
type SchemaLike = { meta?: { volatile?: boolean } }
type ConfigForm<T> = {
  getSnapshot(): { status: string; value?: T; base?: unknown; user?: unknown; writable: boolean; revision?: number }
  subscribe(listener: () => void): () => void
  mutate(ops: readonly unknown[], expectedRevision?: number): Promise<boolean>
}

test('browser settings card key matches the Host settings namespace', () => {
  assert.equal(SETTINGS_NAMESPACE, 'browser')
})

test('browser settings panel covers every public browser configuration field', () => {
  // Single-input controls, and the JSON code editors kept apart from them.
  const fields = [
    'enabled', 'automationMode', 'browserRuntime', 'channel', 'headless', 'opencliEnabled',
    'autoInstall', 'storageStatePath', 'defaultAuthProfile',
    'executablePath', 'snapshotDir', 'verbose', 'cdpPort',
  ]
  assert.deepEqual(FIELD_SPECS.map(spec => spec.field).toSorted(), fields.toSorted())
  assert.deepEqual(JSON_FIELD_SPECS.map(spec => spec.field).toSorted(), ['automationAssets', 'usagePolicy'])

  // Every rendered field must be `.volatile()` in the Host schema: `volatileForm`
  // drops unmarked fields, so a control for one could never be written.
  const dict = (Config as unknown as { dict: Record<string, SchemaLike> }).dict
  for (const spec of [...FIELD_SPECS, ...JSON_FIELD_SPECS]) {
    assert.ok(dict[spec.field], `field ${spec.field} is not in the Host Config schema`)
    assert.equal(dict[spec.field]?.meta?.volatile, true, `field ${spec.field} is not .volatile()`)
  }
})

class ScopeStub implements ConfigForm<Record<string, unknown>> {
  readonly writes: string[] = []
  private readonly listeners = new Set<() => void>()
  private snapshotValue: ConfigFormSnapshot<Record<string, unknown>>

  constructor(base: Record<string, unknown>) {
    this.snapshotValue = { status: 'ready', value: structuredClone(base), base: structuredClone(base), user: {}, revision: 0, writable: true, mode: 'host' }
  }

  getSnapshot(): ConfigFormSnapshot<Record<string, unknown>> { return this.snapshotValue }
  subscribe(listener: () => void): () => void { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }
  /** The Host's one fenced write: apply every op, then bump the revision. */
  async mutate(ops: readonly { op: 'set' | 'unset'; path: readonly string[]; value?: unknown }[]): Promise<boolean> {
    for (const op of ops) {
      const field = op.path[0]!
      this.writes.push(`${op.op}:${field}`)
      const user = { ...(this.snapshotValue.user as Record<string, unknown>) }
      const value = { ...(this.snapshotValue.value ?? {}) }
      const base = this.snapshotValue.base as Record<string, unknown>
      if (op.op === 'set') { user[field] = structuredClone(op.value); value[field] = structuredClone(op.value) }
      else {
        delete user[field]
        if (Object.hasOwn(base, field)) value[field] = structuredClone(base[field])
        else delete value[field]
      }
      this.snapshotValue = { ...this.snapshotValue, value, user }
    }
    this.snapshotValue = { ...this.snapshotValue, revision: (this.snapshotValue.revision ?? 0) + 1 }
    for (const listener of this.listeners) listener()
    return true
  }
  async dispose(): Promise<void> {}
}

function fixture() {
  const scope = new ScopeStub({
    enabled: true, automationMode: 'standard', browserRuntime: 'playwright', channel: 'chromium', headless: true,
    opencliEnabled: true, usagePolicy: { minDelayMs: 750, maxConcurrency: 2, burst: 3, maxPagesPerRun: 20, maxDepth: 2, retryLimit: 2, backoffBaseMs: 1000, cooldownMs: 30000 },
    autoInstall: false, verbose: false,
  })
  const controller = new BrowserSettingsController(scope)
  return { scope, controller, actions: controller.inject() }
}

test('browser panel validates freedom, runtime, and usage buffer before saving', async () => {
  const { scope, controller, actions } = fixture()
  const edit = actions.edit
  edit('automationMode', 'anything')
  assert.equal(controller.snapshot().invalid, true)
  edit('automationMode', 'unrestricted')
  edit('browserRuntime', 'patchright')
  edit('cdpPort', '65536')
  assert.equal(controller.snapshot().fields.cdpPort.invalid, true)
  edit('cdpPort', '9222')
  edit('usagePolicy', '{"maxConcurrency":0}')
  assert.equal(controller.snapshot().jsonFields.usagePolicy.invalid, true)
  edit('usagePolicy', '{"minDelayMs":750,"maxConcurrency":2,"burst":3,"maxPagesPerRun":20,"maxDepth":2,"retryLimit":2,"backoffBaseMs":1000,"cooldownMs":30000}')
  await actions.save()
  assert.equal(scope.getSnapshot().user?.automationMode, 'unrestricted')
  assert.equal(scope.getSnapshot().user?.browserRuntime, 'patchright')
  assert.equal(scope.getSnapshot().user?.cdpPort, 9222)
  assert.deepEqual(scope.getSnapshot().user?.usagePolicy, { minDelayMs: 750, maxConcurrency: 2, burst: 3, maxPagesPerRun: 20, maxDepth: 2, retryLimit: 2, backoffBaseMs: 1000, cooldownMs: 30000 })
  assert.equal(controller.snapshot().dirty, false)
  controller.dispose()
})

test('browser panel keeps rejected writes retryable and resets overrides', async () => {
  const { scope, controller, actions } = fixture()
  scope.mutate = async () => { throw new Error('host write rejected') }
  actions.edit('headless', 'false')
  await actions.save()
  assert.equal(controller.snapshot().failed, true)
  assert.equal(controller.snapshot().dirty, true)

  const second = fixture()
  second.actions.edit('channel', 'chrome')
  await second.actions.save()
  second.actions.resetField('channel')
  await second.actions.save()
  assert.equal(Object.hasOwn(second.scope.getSnapshot().user ?? {}, 'channel'), false)
  second.controller.dispose()
  controller.dispose()
})
