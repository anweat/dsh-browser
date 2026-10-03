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

const { apply, inject } = await import('../src/index.ts')

test('startup resolves persisted settings before browser tools and policy are registered', async () => {
  const snapshotDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-browser-startup-'))
  const definitions = new Map<string, any>()
  const order: string[] = []
  let registerOptions: { applies?: string } | undefined
  try {
    const ctx = {
      settings: {
        register(_namespace: string, _schema: unknown, options: { applies?: string }) {
          order.push('settings')
          registerOptions = options
          return { get: () => ({ automationMode: 'read-only', snapshotDir }) }
        },
      },
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

    apply(ctx as never, { automationMode: 'unrestricted', snapshotDir } as never)

    assert.deepEqual(inject, ['tools', 'settings'])
    assert.equal(order[0], 'settings')
    assert.equal(registerOptions?.applies, 'restart')
    // Startup settings (read-only) win over the entry config (unrestricted): no flat tools, and no interactive action.
    assert.deepEqual([...definitions.keys()].sort(), ['browser_call', 'browser_index'])
    const reply = await definitions.get('browser_call').execute({ action: 'runtime.status' }, { signal: new AbortController().signal })
    assert.equal(reply.ok, true)
    assert.equal(reply.result.automationMode, 'read-only')
    assert.equal(reply.result.exposedActions.includes('act.click'), false)
    assert.equal(reply.result.exposedActions.includes('observe.read'), true)
    const denied = await definitions.get('browser_call').execute({ action: 'act.click', args: { selector: 'a' } }, { signal: new AbortController().signal })
    assert.equal(denied.ok, false)
    assert.equal(denied.error.code, 'POLICY_DENIED')
  } finally {
    fs.rmSync(snapshotDir, { recursive: true, force: true })
  }
})
