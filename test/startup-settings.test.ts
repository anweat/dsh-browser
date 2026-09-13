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
    assert.equal(definitions.has('browser_click'), false)
    const status = await definitions.get('browser_status').execute({}, { signal: undefined })
    assert.equal(status.automationMode, 'read-only')
    assert.equal(status.exposedTools.includes('browser_click'), false)
  } finally {
    fs.rmSync(snapshotDir, { recursive: true, force: true })
  }
})
