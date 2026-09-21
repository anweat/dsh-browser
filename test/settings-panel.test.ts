import assert from 'node:assert/strict'
import test from 'node:test'
import type { SettingsScope, SettingsScopeSnapshot } from '@deepseek-ai/dsh-client-ui-settings/client'
import { BrowserSettingsController, FIELD_SPECS } from '../src/client/form.ts'
import { SETTINGS_NAMESPACE } from '../src/client/settings-namespace.ts'
import { Config } from '../src/config.ts'

test('browser settings card key matches the Host settings namespace', () => {
  assert.equal(SETTINGS_NAMESPACE, 'browser')
})

test('browser settings panel covers every public browser configuration field', () => {
  const fields = [
    'enabled', 'automationMode', 'browserRuntime', 'channel', 'headless', 'opencliEnabled',
    'usagePolicy', 'automationAssets', 'autoInstall', 'storageStatePath', 'authProfiles', 'defaultAuthProfile',
    'rulePacks', 'executablePath', 'snapshotDir', 'verbose', 'cdpPort', 'args',
  ]
  assert.deepEqual(FIELD_SPECS.map(spec => spec.field).toSorted(), fields.toSorted())
  assert.deepEqual(
    FIELD_SPECS.map(spec => spec.field).toSorted(),
    Object.keys((Config as unknown as { dict: Record<string, unknown> }).dict).toSorted(),
  )
})

class ScopeStub implements SettingsScope<Record<string, unknown>> {
  readonly writes: string[] = []
  private readonly listeners = new Set<() => void>()
  private snapshotValue: SettingsScopeSnapshot<Record<string, unknown>>

  constructor(base: Record<string, unknown>) {
    this.snapshotValue = { status: 'ready', value: structuredClone(base), base: structuredClone(base), user: {}, revision: 0, writable: true, mode: 'host' }
  }

  getSnapshot(): SettingsScopeSnapshot<Record<string, unknown>> { return this.snapshotValue }
  subscribe(listener: () => void): () => void { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }
  async set(field: string, value: unknown): Promise<void> {
    this.writes.push(`set:${field}`)
    const user = { ...(this.snapshotValue.user as Record<string, unknown>), [field]: structuredClone(value) }
    this.snapshotValue = { ...this.snapshotValue, value: { ...(this.snapshotValue.value ?? {}), [field]: structuredClone(value) }, user, revision: (this.snapshotValue.revision ?? 0) + 1 }
    for (const listener of this.listeners) listener()
  }
  async unset(field: string): Promise<void> {
    this.writes.push(`unset:${field}`)
    const user = { ...(this.snapshotValue.user as Record<string, unknown>) }
    delete user[field]
    const value = { ...(this.snapshotValue.value ?? {}) }
    const base = this.snapshotValue.base as Record<string, unknown>
    if (Object.hasOwn(base, field)) value[field] = structuredClone(base[field])
    else delete value[field]
    this.snapshotValue = { ...this.snapshotValue, value, user, revision: (this.snapshotValue.revision ?? 0) + 1 }
    for (const listener of this.listeners) listener()
  }
  async dispose(): Promise<void> {}
}

function fixture() {
  const scope = new ScopeStub({
    enabled: true, automationMode: 'standard', browserRuntime: 'playwright', channel: 'chromium', headless: true,
    opencliEnabled: true, usagePolicy: { minDelayMs: 750, maxConcurrency: 2, burst: 3, maxPagesPerRun: 20, maxDepth: 2, retryLimit: 2, backoffBaseMs: 1000, cooldownMs: 30000 },
    autoInstall: false, verbose: false,
  })
  return { scope, controller: new BrowserSettingsController(scope) }
}

test('browser panel validates freedom, runtime, and usage buffer before saving', async () => {
  const { scope, controller } = fixture()
  controller.edit('automationMode', 'anything')
  assert.equal(controller.snapshot().invalid, true)
  controller.edit('automationMode', 'unrestricted')
  controller.edit('browserRuntime', 'patchright')
  controller.edit('cdpPort', '65536')
  assert.equal(controller.snapshot().fields.cdpPort.invalid, true)
  controller.edit('cdpPort', '9222')
  controller.edit('args', '["--disable-gpu", 1]')
  assert.equal(controller.snapshot().fields.args.invalid, true)
  controller.edit('args', '["--disable-gpu"]')
  controller.edit('usagePolicy', '{"maxConcurrency":0}')
  assert.equal(controller.snapshot().fields.usagePolicy.invalid, true)
  controller.edit('usagePolicy', '{"minDelayMs":750,"maxConcurrency":2,"burst":3,"maxPagesPerRun":20,"maxDepth":2,"retryLimit":2,"backoffBaseMs":1000,"cooldownMs":30000}')
  await controller.save()
  assert.equal(scope.getSnapshot().user?.automationMode, 'unrestricted')
  assert.equal(scope.getSnapshot().user?.browserRuntime, 'patchright')
  assert.equal(scope.getSnapshot().user?.cdpPort, 9222)
  assert.deepEqual(scope.getSnapshot().user?.args, ['--disable-gpu'])
  assert.deepEqual(scope.getSnapshot().user?.usagePolicy, { minDelayMs: 750, maxConcurrency: 2, burst: 3, maxPagesPerRun: 20, maxDepth: 2, retryLimit: 2, backoffBaseMs: 1000, cooldownMs: 30000 })
  assert.equal(controller.snapshot().dirty, false)
  controller.dispose()
})

test('browser panel keeps rejected writes retryable and resets overrides', async () => {
  const { scope, controller } = fixture()
  scope.set = async () => { throw new Error('host write rejected') }
  controller.edit('headless', 'false')
  await controller.save()
  assert.equal(controller.snapshot().failed, true)
  assert.equal(controller.snapshot().dirty, true)

  const second = fixture()
  second.controller.edit('channel', 'chrome')
  await second.controller.save()
  second.controller.resetField('channel')
  await second.controller.save()
  assert.equal(Object.hasOwn(second.scope.getSnapshot().user ?? {}, 'channel'), false)
  second.controller.dispose()
  controller.dispose()
})
