import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs'
import path from 'node:path'
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

test('the settings namespace is the loader entry id of the bundle patch row', () => {
  // The Host keys the settings page by the entry id; the card binds to the same string.
  const patch = fs.readFileSync(path.join(import.meta.dirname, '..', 'cordis.patch.yml'), 'utf8')
  assert.match(patch, new RegExp('id:\\s*' + SETTINGS_NAMESPACE + '\\b'))
})

test('browser settings panel covers every public browser configuration field', () => {
  // Single-input controls, and the JSON code editors kept apart from them.
  const fields = [
    'enabled', 'automationMode', 'toolSurface', 'browserRuntime', 'channel', 'headless', 'opencliEnabled',
    'autoInstall', 'storageStatePath', 'defaultAuthProfile',
    'executablePath', 'snapshotDir', 'verbose', 'cdpPort', 'maxSessions',
    'downloadDir', 'downloadMaxBytes', 'allowPrivateHosts', 'viewportMode', 'viewportWidth', 'viewportHeight', 'userAgent', 'locale', 'timezoneId', 'proxyServer', 'proxyBypass',
  ]
  assert.deepEqual(FIELD_SPECS.map(spec => spec.field).toSorted(), fields.toSorted())
  assert.deepEqual(JSON_FIELD_SPECS.map(spec => spec.field).toSorted(), ['args', 'automationAssets', 'prompts', 'usagePolicy'])

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

test('browser panel accepts every automationAssets key, and holds minInputSetsForActivation to 1-5 instead of clamping silently', () => {
  const { controller, actions } = fixture()
  const invalid = () => controller.snapshot().jsonFields.automationAssets.invalid
  actions.edit('automationAssets', '{"maxTestCredentials":8,"minInputSetsForActivation":3}')
  assert.equal(invalid(), false)
  for (const bad of ['0', '6', '2.5', '"2"', '-1']) {
    actions.edit('automationAssets', `{"minInputSetsForActivation":${bad}}`)
    assert.equal(invalid(), true, `minInputSetsForActivation ${bad} is refused`)
  }
  actions.edit('automationAssets', '{"minInputSetsForActivationn":2}')
  assert.equal(invalid(), true, 'an unknown key is refused')
  actions.edit('automationAssets', '{"persistenceMode":"manual","activationMode":"manual","enabled":false,"minSuccessRate":0.9}')
  assert.equal(invalid(), false)
  actions.edit('automationAssets', '{"persistenceMode":"sometimes"}')
  assert.equal(invalid(), true)
  controller.dispose()
})

test('browser panel edits maxSessions within 1-64 and the Chromium launch arguments as a JSON array of strings', async () => {
  const { scope, controller, actions } = fixture()
  for (const bad of ['0', '65', '2.5', 'many']) {
    actions.edit('maxSessions', bad)
    assert.equal(controller.snapshot().fields.maxSessions.invalid, true, `maxSessions ${bad}`)
  }
  actions.edit('maxSessions', '12')
  assert.equal(controller.snapshot().fields.maxSessions.invalid, false)
  for (const bad of ['{"a":1}', '["--ok", 3]', '["--ok", ""]', '--disable-gpu', '["--ok"']) {
    actions.edit('args', bad)
    assert.equal(controller.snapshot().jsonFields.args.invalid, true, `args ${bad}`)
  }
  assert.equal(controller.snapshot().invalid, true)
  actions.edit('args', '["--disable-gpu","--lang=en-US"]')
  assert.equal(controller.snapshot().jsonFields.args.invalid, false)
  await actions.save()
  assert.equal(scope.getSnapshot().user?.maxSessions, 12)
  assert.deepEqual(scope.getSnapshot().user?.args, ['--disable-gpu', '--lang=en-US'])
  assert.equal(controller.snapshot().jsonFields.args.text, '["--disable-gpu","--lang=en-US"]', 'the box shows what is stored, on one line')
  // Emptying the box clears the override.
  actions.edit('args', '')
  await actions.save()
  assert.equal(Object.hasOwn(scope.getSnapshot().user ?? {}, 'args'), false)
  controller.dispose()
})

test('browser panel edits the tool surface and refuses values the schema does not know', async () => {
  const { scope, controller, actions } = fixture()
  actions.edit('toolSurface', 'deferred')
  assert.equal(controller.snapshot().fields.toolSurface.invalid, true, 'deferred is not a supported surface yet')
  actions.edit('toolSurface', 'flat')
  assert.equal(controller.snapshot().fields.toolSurface.invalid, false)
  await actions.save()
  assert.equal(scope.getSnapshot().user?.toolSurface, 'flat')
  actions.resetField('toolSurface')
  await actions.save()
  assert.equal(Object.hasOwn(scope.getSnapshot().user ?? {}, 'toolSurface'), false)
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


// --- the "prompt text" section ----------------------------------------------------------------------------------

test('prompt text controls stage one pruned `prompts` draft, and saving writes it as a single field', async () => {
  const { scope, controller, actions } = fixture()
  const state = () => controller.snapshot().prompts
  actions.editPromptText('rootNote', 'Prefer the intranet search.')
  actions.editPromptText('indexDescription', 'INDEX')
  actions.editPromptText('skillBodyFile', '/etc/skill.md')
  assert.equal(state().texts.rootNote.text, 'Prefer the intranet search.')
  assert.equal(controller.snapshot().dirty, true)
  assert.equal(controller.snapshot().invalid, false)
  await actions.save()
  assert.deepEqual(scope.writes, ['set:prompts'], 'one field write for all of them')
  assert.deepEqual(scope.getSnapshot().user?.prompts, { tools: { browser_index: { description: 'INDEX' } }, rootNote: 'Prefer the intranet search.', skill: { bodyFile: '/etc/skill.md' } })
  assert.equal(state().overridden, true)
  // Emptying a control removes just that key, and the parents it leaves empty.
  actions.editPromptText('indexDescription', '')
  actions.editPromptText('skillBodyFile', '')
  await actions.save()
  assert.deepEqual(scope.getSnapshot().user?.prompts, { rootNote: 'Prefer the intranet search.' })
  // Emptying the last one clears the field, back to the deployed value.
  actions.editPromptText('rootNote', '')
  await actions.save()
  assert.equal(Object.hasOwn(scope.getSnapshot().user ?? {}, 'prompts'), false)
  assert.equal(state().overridden, false)
  controller.dispose()
})

test('prompt text: the skill switch only writes `false`, and an over-long text blocks the save', async () => {
  const { scope, controller, actions } = fixture()
  actions.setPromptSkillEnabled(false)
  assert.equal(controller.snapshot().prompts.skillEnabled, false)
  await actions.save()
  assert.deepEqual(scope.getSnapshot().user?.prompts, { skill: { enabled: false } })
  actions.setPromptSkillEnabled(true)
  await actions.save()
  assert.equal(Object.hasOwn(scope.getSnapshot().user ?? {}, 'prompts'), false, 'enabled is the default, so nothing is stored')

  actions.editPromptText('rootNote', 'x'.repeat(801))
  assert.equal(controller.snapshot().prompts.texts.rootNote.invalid, true)
  assert.equal(controller.snapshot().invalid, true)
  const writes = scope.writes.length
  await actions.save()
  assert.equal(scope.writes.length, writes, 'nothing was written')
  actions.editPromptText('rootNote', 'x'.repeat(800))
  assert.equal(controller.snapshot().invalid, false)
  controller.dispose()
})

test('prompt text: the groups/actions/errorHints box validates, keeps what is typed, merges into the draft, and resets', async () => {
  const { scope, controller, actions } = fixture()
  const state = () => controller.snapshot().prompts
  actions.editPromptText('rootGuide', 'GUIDE')
  // Not JSON yet: the text stays as typed, the form is invalid, and saving is refused.
  actions.editPromptExtras('{"groups": {')
  assert.equal(state().extras.text, '{"groups": {')
  assert.equal(state().extras.invalid, true)
  assert.equal(controller.snapshot().invalid, true)
  const before = scope.writes.length
  await actions.save()
  assert.equal(scope.writes.length, before)
  // Valid JSON, but a type or key the plugin would never take.
  actions.editPromptExtras('{"actions":{"act.click":{"summary":5}}}')
  assert.equal(state().extras.invalid, true)
  actions.editPromptExtras('{"colors":{}}')
  assert.equal(state().extras.invalid, true)
  actions.editPromptExtras('{"errorHints":{"DEADLINE":"' + 'x'.repeat(601) + '"}}')
  assert.equal(state().extras.invalid, true, 'over the hint limit')
  // Valid: merged with the other controls' text in the one draft.
  const good = '{"groups":{"act":{"summary":"ACT"}},"actions":{"act.click":{"summary":"CLICK","notes":"N"}},"errorHints":{"DEADLINE":"D"}}'
  actions.editPromptExtras(good)
  assert.equal(state().extras.invalid, false)
  assert.equal(controller.snapshot().invalid, false)
  await actions.save()
  assert.deepEqual(scope.getSnapshot().user?.prompts, { rootGuide: 'GUIDE', groups: { act: { summary: 'ACT' } }, actions: { 'act.click': { summary: 'CLICK', notes: 'N' } }, errorHints: { DEADLINE: 'D' } })
  assert.deepEqual(JSON.parse(state().extras.text), JSON.parse(good), 'the box shows what is stored')
  // Editing a plain control leaves the box's content alone.
  actions.editPromptText('rootNote', 'NOTE')
  assert.deepEqual(JSON.parse(state().extras.text), JSON.parse(good))
  // Reset restores the defaults of those three members and nothing else.
  actions.resetPromptExtras()
  assert.equal(state().extras.text, '')
  await actions.save()
  assert.deepEqual(scope.getSnapshot().user?.prompts, { rootGuide: 'GUIDE', rootNote: 'NOTE' })
  // Discard drops an invalid box too.
  actions.editPromptExtras('nope')
  assert.equal(controller.snapshot().invalid, true)
  actions.discard()
  assert.equal(controller.snapshot().invalid, false)
  assert.equal(state().extras.text, '')
  controller.dispose()
})

test('prompt text: restoring the stored value by hand leaves the form clean, whatever empty defaults the host filled in', async () => {
  const scope = new ScopeStub({ enabled: true, prompts: { tools: { browser_index: {}, browser_call: {} }, groups: {}, actions: {}, errorHints: {}, skill: { enabled: true } } })
  const controller = new BrowserSettingsController(scope)
  const actions = controller.inject()
  actions.editPromptText('rootNote', 'temp')
  assert.equal(controller.snapshot().dirty, true)
  actions.editPromptText('rootNote', '')
  assert.equal(controller.snapshot().dirty, false)
  controller.dispose()
})

test('the prompts status controller reads the plugin report through the private channel and survives a restart gap', async () => {
  const { PromptsStatusController } = await import('../src/client/prompts-status-client.ts')
  const { rpcFixture } = await import('./rpc-fixture.ts')
  const report = { overrides: [{ key: 'rootNote', length: 5 }], diagnostics: [], budget: { l0Tokens: 325, l0Budget: 1500, layerBudget: 1000, largestLayer: { name: 'x', tokens: 9 }, overBudget: [] }, skill: { enabled: true, body: 'packaged' } }
  const { rpc, requests } = rpcFixture(undefined, () => report)
  const controller = new PromptsStatusController(rpc as never)
  await controller.refresh()
  assert.deepEqual(controller.snapshot().status, report)
  assert.equal(controller.snapshot().failed, false)
  assert.equal(requests.at(-1)!.endpoint, 'prompts')
  // A failing call keeps the last report and says so.
  const flaky = new PromptsStatusController({ call: async () => { throw new Error('plugin restarting') } } as never)
  await flaky.refresh()
  assert.equal(flaky.snapshot().failed, true)
  assert.equal(flaky.snapshot().loading, false)
  controller.dispose(); flaky.dispose()
})

test('the context and download text fields refuse, at save time, what the server would drop', () => {
  const spec = (field: string) => FIELD_SPECS.find(entry => entry.field === field)!
  assert.equal(spec('proxyServer').parse('ftp://127.0.0.1:1'), undefined)
  assert.equal(spec('proxyServer').parse('http://user:pw@127.0.0.1:1'), undefined)
  assert.deepEqual(spec('proxyServer').parse(' http://127.0.0.1:7890 '), { kind: 'set', value: 'http://127.0.0.1:7890' })
  assert.deepEqual(spec('proxyServer').parse('  '), { kind: 'clear' })
  assert.equal(spec('downloadDir').parse('relative/dir'), undefined)
  assert.deepEqual(spec('downloadDir').parse('/var/dl'), { kind: 'set', value: '/var/dl' })
  assert.equal(spec('locale').parse('not a locale'), undefined)
  assert.equal(spec('timezoneId').parse('Mars/Base'), undefined)
  assert.equal(spec('userAgent').parse('a\nb'), undefined)
  assert.equal(spec('viewportWidth').parse('5'), undefined)
  assert.equal(spec('viewportMode').parse('custom') !== undefined, true)
  assert.equal(spec('viewportMode').parse('huge'), undefined)
})

// --- the default-parameters (properties) editor ---------------------------------------------------------------

const { PROPERTY_FIELDS, validateProperty } = await import('../src/client/properties-form.ts')

/** What the old one-control-per-field form sent for each default, as the text of that control. */
const LEGACY_TEXTS: Record<string, string> = {
  browserRuntime: 'patchright', channel: 'chrome', headless: 'false', autoInstall: 'true', executablePath: '/opt/chrome/chrome', cdpPort: '9222', maxSessions: '12',
  args: '["--disable-gpu","--lang=en-US"]', viewportMode: 'custom', viewportWidth: '1280', viewportHeight: '720', userAgent: 'DSH/1.0 (a=b)', locale: 'en-US',
  timezoneId: 'Asia/Shanghai', proxyServer: 'http://127.0.0.1:7890', proxyBypass: 'a.com,.b.test', storageStatePath: '/s/state.json', defaultAuthProfile: 'forum',
  allowPrivateHosts: 'true', snapshotDir: '/data/snap', downloadDir: '/data/dl', downloadMaxBytes: '5000', verbose: 'true',
}

test('properties: the same configuration saved through the old per-field form and through the text writes identical config', async () => {
  const legacy = fixture()
  for (const [field, text] of Object.entries(LEGACY_TEXTS)) legacy.actions.edit(field, text)
  assert.equal(legacy.controller.snapshot().invalid, false)
  await legacy.actions.save()

  const viaText = fixture()
  const text = Object.entries(LEGACY_TEXTS).map(([field, value]) => `${field} = ${value}`).join('\n')
  viaText.actions.editProperties(text)
  assert.equal(viaText.controller.snapshot().invalid, false, JSON.stringify(viaText.controller.snapshot().properties.issues))
  assert.equal(viaText.controller.snapshot().dirty, true)
  await viaText.actions.save()

  assert.deepEqual(viaText.scope.getSnapshot().user, legacy.scope.getSnapshot().user, 'same config rows')
  assert.deepEqual(viaText.scope.writes.toSorted(), legacy.scope.writes.toSorted(), 'same set / unset operations')
  const user = viaText.scope.getSnapshot().user as Record<string, unknown>
  assert.equal(user.maxSessions, 12)
  assert.equal(user.headless, false)
  assert.deepEqual(user.args, ['--disable-gpu', '--lang=en-US'])
  assert.deepEqual(Object.keys(user).toSorted(), Object.keys(LEGACY_TEXTS).toSorted(), 'only flat keys, nothing else')
  // After the save the editor prints the stored values as lines, and nothing is dirty.
  assert.equal(viaText.controller.snapshot().dirty, false)
  const printed = viaText.controller.snapshot().properties
  assert.match(printed.text, /^userAgent = DSH\/1\.0 \(a=b\)$/m)
  assert.match(printed.text, /^args = \["--disable-gpu","--lang=en-US"\]$/m)
  assert.equal(printed.overridden.length, Object.keys(LEGACY_TEXTS).length)
  legacy.controller.dispose(); viaText.controller.dispose()
})

test('properties: removing or commenting a line goes back to the default; the reset button does the same; equal-to-default writes nothing', async () => {
  const { scope, controller, actions } = fixture()
  actions.editProperties('maxSessions = 12\nlocale = de-DE\nverbose = true')
  await actions.save()
  assert.deepEqual(scope.getSnapshot().user, { maxSessions: 12, locale: 'de-DE', verbose: true })
  // The printed text is the starting point; commenting a line unsets just that key.
  const text = controller.snapshot().properties.text
  actions.editProperties(text.replace('locale = de-DE', '# locale = de-DE'))
  assert.equal(controller.snapshot().dirty, true)
  await actions.save()
  assert.equal(Object.hasOwn(scope.getSnapshot().user ?? {}, 'locale'), false)
  assert.equal(scope.getSnapshot().user?.maxSessions, 12)
  // Deleting the line works too, and the reset button.
  actions.editProperties(controller.snapshot().properties.text.split('\n').filter(line => !line.startsWith('verbose =')).join('\n'))
  await actions.save()
  assert.equal(Object.hasOwn(scope.getSnapshot().user ?? {}, 'verbose'), false)
  actions.resetProperty('maxSessions')
  assert.match(controller.snapshot().properties.text, /^# maxSessions = /m)
  await actions.save()
  assert.deepEqual(scope.getSnapshot().user, {})
  // A line equal to the value already in force is not an override.
  const before = scope.writes.length
  actions.editProperties('browserRuntime = playwright\nchannel = chromium')
  assert.equal(controller.snapshot().dirty, false)
  await actions.save()
  assert.equal(scope.writes.length, before)
  controller.dispose()
})

test('properties: a line with a problem blocks the save and names the line; unknown keys only warn; discard drops the text', async () => {
  const { scope, controller, actions } = fixture()
  actions.editProperties('locale = en-US\nproxyServer = ftp://127.0.0.1:1\nbogus = 1\nviewportMode = custom')
  const state = controller.snapshot()
  assert.equal(state.invalid, true)
  assert.equal(state.properties.invalid, true)
  assert.deepEqual(state.properties.issues.map(issue => [issue.line, issue.level, issue.key]), [[2, 'error', 'proxyServer'], [3, 'warning', 'bogus'], [4, 'error', 'viewportWidth'], [4, 'error', 'viewportHeight']])
  assert.match(state.properties.issues[0]!.message, /^line 2: proxyServer scheme must be one of/)
  assert.equal(state.properties.text.startsWith('locale = en-US'), true, 'what was typed is kept verbatim')
  const writes = scope.writes.length
  await actions.save()
  assert.equal(scope.writes.length, writes, 'nothing was written')
  // Fix the lines: the warning stays, the save goes through.
  actions.editProperties('locale = en-US\nproxyServer = http://127.0.0.1:1\nbogus = 1\nviewportMode = custom\nviewportWidth = 800\nviewportHeight = 600')
  assert.equal(controller.snapshot().invalid, false)
  assert.deepEqual(controller.snapshot().properties.issues.map(issue => issue.level), ['warning'])
  await actions.save()
  assert.deepEqual(scope.getSnapshot().user, { locale: 'en-US', proxyServer: 'http://127.0.0.1:1', viewportMode: 'custom', viewportWidth: 800, viewportHeight: 600 })
  // discard
  actions.editProperties('locale = fr-FR')
  actions.discard()
  assert.equal(controller.snapshot().dirty, false)
  assert.match(controller.snapshot().properties.text, /^locale = en-US$/m)
  controller.dispose()
})

test('properties: the text rules and the old controls agree on every sample (no second rule set to drift)', () => {
  const samples: Record<string, string[]> = {
    browserRuntime: ['playwright', 'patchright', 'firefox'], headless: ['true', 'false', 'yes', '1'], maxSessions: ['1', '64', '0', '65', '2.5', 'x'],
    cdpPort: ['1', '65535', '0', '65536'], args: ['["--a"]', '["--a",""]', '--a', '{"a":1}'], viewportMode: ['window', '720p', 'huge'],
    viewportWidth: ['200', '7680', '199', '7681'], downloadMaxBytes: ['1', '104857600', '0', '-5'],
  }
  for (const field of PROPERTY_FIELDS) {
    const spec = FIELD_SPECS.find(entry => entry.field === field.key) ?? JSON_FIELD_SPECS.find(entry => entry.field === field.key)
    assert.ok(spec, `${field.key} has a field spec`)
    for (const value of samples[field.key] ?? []) {
      const textSays = validateProperty(field, value) === undefined
      const controlSays = spec!.parse(value) !== undefined
      assert.equal(textSays, controlSays, `${field.key} = ${JSON.stringify(value)}: text ${textSays ? 'accepts' : 'refuses'}, control ${controlSays ? 'accepts' : 'refuses'}`)
    }
  }
})
