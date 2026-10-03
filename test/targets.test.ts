import test from 'node:test'
import assert from 'node:assert/strict'
import { BrowserService } from '../src/browser-service.ts'
import { resolveConfig } from '../src/config.ts'
import { mapError } from '../src/actions/errors.ts'
import { findAction } from '../src/actions/registry.ts'
import { validateArgs } from '../src/actions/schema.ts'

test('listing or selecting pages of a session that never opened one is a pure query: no bucket is created, and a stale id is TARGET_CLOSED', async () => {
  const service = new BrowserService(resolveConfig({ enabled: true } as never))
  assert.deepEqual(await service.listTargets({ session: 'session:nobody' }), { targets: [] })
  const error = await service.selectTarget('t1', { session: 'session:nobody' }).catch(caught => caught)
  assert.match(error.message, /no active page with target id "t1"/)
  assert.equal(mapError(error, 'target.select').code, 'TARGET_CLOSED')
  assert.equal((service as unknown as { sessions: Map<string, unknown> }).sessions.size, 0, 'asking never mints a session bucket')
})

test('target.select is a read-only, no-approval action that needs an id', () => {
  const select = findAction('target.select')!
  assert.equal(select.readOnly, true)
  assert.equal(select.mutating, false)
  assert.equal(select.approval, 'none')
  assert.equal(validateArgs(select.params, {}).errors[0], 'id: required')
  assert.deepEqual(validateArgs(select.params, { id: 't2' }).errors, [])
})
