import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { registerHooks } from 'node:module'

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === '@deepseek-ai/dsh-tools') {
      return { url: 'data:text/javascript,export const defineTool = value => value', shortCircuit: true }
    }
    return nextResolve(specifier, context)
  },
})

const { apply, BROWSER_SETTINGS_NS } = await import('../src/index.ts')
const { resolveSettingsScope } = await import('../src/settings-scope.ts')

/** Minimal host double; `settings` is whatever the host version exposes. */
function host(settings: unknown, snapshotDir: string) {
  const order: string[] = []
  const definitions = new Map<string, any>()
  const ctx = {
    settings,
    tools: {
      register(definition: any) {
        order.push('tool:' + definition.name)
        definitions.set(definition.name, definition)
      },
    },
    on() { order.push('policy') },
    provide() { order.push('service') },
    effect(register: () => unknown) { register() },
    inject() {},
    logger() { return { info() {} } },
  }
  return { ctx, order, definitions, snapshotDir }
}

test('hosts without settings.register fall back to the Loader-managed entry config', async () => {
  const snapshotDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-browser-newhost-'))
  try {
    // dsh-v0.1.7-rc.2+ ships SettingsForms with configure/describe/update/
    // replace/mutate only — calling register() there threw a TypeError and
    // aborted the whole fiber, leaving `browser` unprovided.
    const { ctx, order, definitions } = host({ configure: () => () => {} }, snapshotDir)

    apply(ctx as never, { automationMode: 'unrestricted', snapshotDir } as never)

    // The service must still be provided and tools must still register.
    assert.ok(order.includes('service'), 'browser service was not provided')
    assert.ok(order.includes('policy'), 'policy hook was not registered')
    assert.ok(definitions.has('browser_click'), 'browser tools did not register')

    // The live config is the entry config the host passed in, so the
    // unrestricted mode requested at composition is honoured.
    const status = await definitions.get('browser_status').execute({}, { signal: undefined })
    assert.equal(status.automationMode, 'unrestricted')
    assert.equal(status.exposedTools.includes('browser_click'), true)
  } finally {
    fs.rmSync(snapshotDir, { recursive: true, force: true })
  }
})

test('hosts that still expose settings.register keep the live scope path', () => {
  let registeredNamespace: string | undefined
  let registeredApplies: string | undefined
  const resolution = resolveSettingsScope(
    {
      register(namespace: string, _schema: unknown, options?: { applies?: string }) {
        registeredNamespace = namespace
        registeredApplies = options?.applies
        return { get: () => ({ channel: 'from-scope' }) }
      },
    },
    'browser',
    {},
    { channel: 'from-entry' },
  )

  assert.equal(resolution.mode, 'scope')
  assert.equal(registeredNamespace, 'browser')
  assert.equal(registeredApplies, 'restart')
  // The scope wins over the entry config on legacy hosts, preserving live edits.
  assert.equal(resolution.get().channel, 'from-scope')
})

test('resolveSettingsScope tolerates an absent or malformed settings service', () => {
  for (const settings of [undefined, null, {}, { register: 'not-a-function' }, 42]) {
    const resolution = resolveSettingsScope(settings, 'browser', {}, { channel: 'from-entry' })
    assert.equal(resolution.mode, 'entry')
    assert.equal(resolution.get().channel, 'from-entry')
  }
})

test('the settings namespace matches the bundle patch loader entry id', async () => {
  const patch = fs.readFileSync(path.join(import.meta.dirname, '..', 'cordis.patch.yml'), 'utf8')
  // The entry id must stay in sync so both the legacy scope namespace and the
  // newer entry-derived settings page address the same section.
  assert.match(patch, new RegExp('id:\\s*' + BROWSER_SETTINGS_NS + '\\b'))
})
