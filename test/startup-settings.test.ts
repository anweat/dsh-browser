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

const { Context } = await import('@deepseek-ai/cordis')
const { default: plugin, apply, inject } = await import('../src/index.ts')

/** The shape `cosmokit.createVolatile` gives a `.volatile()` field: a live reference, not a value. */
function volatile(initial: unknown): { get(): unknown; [key: symbol]: (value: unknown) => void } {
  let current = initial
  return Object.freeze({ get: () => current, [Symbol.for('cosmokit.volatile.write')]: (value: unknown) => { current = value } })
}

/** Minimal host double: the Loader hands `apply` the entry config. `settings` throws when touched: `apply` must never read it. */
function host() {
  const definitions = new Map<string, any>()
  const order: string[] = []
  const ctx = {
    get settings(): never { throw new Error('apply must not read ctx.settings') },
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
  return { ctx, definitions, order }
}

const signal = () => ({ signal: new AbortController().signal })

test('startup applies the entry config the Host passes in, before any browser call', async () => {
  const snapshotDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-browser-startup-'))
  try {
    const { ctx, definitions, order } = host()

    apply(ctx as never, { automationMode: 'read-only', snapshotDir } as never)

    assert.deepEqual(inject, ['tools'])
    assert.ok(order.includes('service'), 'browser service was not provided')
    assert.ok(order.includes('policy'), 'policy hook was not registered')
    // read-only: no flat tools, and no interactive action.
    assert.deepEqual([...definitions.keys()].sort(), ['browser_call', 'browser_index'])
    const reply = await definitions.get('browser_call').execute({ action: 'runtime.status' }, signal())
    assert.equal(reply.ok, true)
    assert.equal(reply.result.automationMode, 'read-only')
    assert.equal(reply.result.exposedActions.includes('act.click'), false)
    assert.equal(reply.result.exposedActions.includes('observe.read'), true)
    const denied = await definitions.get('browser_call').execute({ action: 'act.click', args: { selector: 'a' } }, signal())
    assert.equal(denied.ok, false)
    assert.equal(denied.error.code, 'POLICY_DENIED')
  } finally {
    fs.rmSync(snapshotDir, { recursive: true, force: true })
  }
})

test('a different entry config gives a different startup: unrestricted exposes the interactive actions', async () => {
  const snapshotDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-browser-startup-'))
  try {
    const { ctx, definitions } = host()

    apply(ctx as never, { automationMode: 'unrestricted', snapshotDir } as never)

    const reply = await definitions.get('browser_call').execute({ action: 'runtime.status' }, signal())
    assert.equal(reply.result.automationMode, 'unrestricted')
    assert.equal(reply.result.exposedActions.includes('act.click'), true)
  } finally {
    fs.rmSync(snapshotDir, { recursive: true, force: true })
  }
})

test('fields the Host delivers as `.volatile()` references are read once at startup', async () => {
  const snapshotDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-browser-startup-'))
  try {
    const { ctx, definitions } = host()
    const automationMode = volatile('read-only')

    apply(ctx as never, { automationMode, snapshotDir: volatile(snapshotDir) } as never)

    const reply = await definitions.get('browser_call').execute({ action: 'runtime.status' }, signal())
    assert.equal(reply.result.automationMode, 'read-only')
    // A later save writes into the reference, but tool exposure and approval were fixed at startup.
    ;automationMode[Symbol.for('cosmokit.volatile.write')]!('unrestricted')
    const after = await definitions.get('browser_call').execute({ action: 'runtime.status' }, signal())
    assert.equal(after.result.automationMode, 'read-only')
  } finally {
    fs.rmSync(snapshotDir, { recursive: true, force: true })
  }
})

/** A Cordis root with a `tools` service double; `withSettings` also provides a `settings` service that records every touch. */
function cordisHost(options: { withSettings: boolean }) {
  const tools: any[] = []
  const touched: (string | symbol)[] = []
  const root = new Context()
  root.provide('tools', { register(tool: any) { tools.push(tool); return () => {} } })
  if (options.withSettings) {
    root.provide('settings', new Proxy({}, { get(_target, key) { touched.push(key); return undefined } }))
  }
  return { root, tools, touched }
}

const settle = () => new Promise(resolve => setTimeout(resolve, 40))

test('settings is not a declared dependency: only tools is required, on the module and on the plugin object', () => {
  assert.deepEqual(inject, ['tools'])
  assert.deepEqual([...(plugin as unknown as { inject: readonly string[] }).inject], ['tools'])
})

test('a Context without a settings service still applies the plugin and registers its tools', async () => {
  const snapshotDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-browser-nosettings-'))
  const { root, tools } = cordisHost({ withSettings: false })
  try {
    assert.equal((root as any).settings, undefined)
    const fiber = root.plugin(plugin as never, { snapshotDir } as never)
    await settle()
    // Cordis 4.0.4 would leave the plugin pending if `settings` were a required inject; the tools prove it ran.
    assert.deepEqual(tools.map(tool => tool.name).sort(), ['browser_call', 'browser_index'])
    const reply = await tools.find(tool => tool.name === 'browser_call').execute({ action: 'runtime.status' }, signal())
    assert.equal(reply.ok, true)
    fiber.dispose()
  } finally {
    fs.rmSync(snapshotDir, { recursive: true, force: true })
  }
})

test('with a settings service present the plugin behaves the same and never touches it', async () => {
  const snapshotDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-browser-withsettings-'))
  const { root, tools, touched } = cordisHost({ withSettings: true })
  try {
    const fiber = root.plugin(plugin as never, { snapshotDir, automationMode: 'read-only' } as never)
    await settle()
    assert.deepEqual(tools.map(tool => tool.name).sort(), ['browser_call', 'browser_index'])
    const reply = await tools.find(tool => tool.name === 'browser_call').execute({ action: 'runtime.status' }, signal())
    assert.equal(reply.ok, true)
    assert.equal(reply.result.automationMode, 'read-only')
    assert.deepEqual(touched, [], 'the settings service was read')
    fiber.dispose()
  } finally {
    fs.rmSync(snapshotDir, { recursive: true, force: true })
  }
})
