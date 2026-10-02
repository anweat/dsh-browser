import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeObserve } from '../src/observe.ts'
import { runAction } from '../src/actions/run.ts'
import { findAction } from '../src/actions/registry.ts'
import { resolveConfig } from '../src/config.ts'

const ENV = { mode: 'unrestricted' as const, options: { modelDevelopmentEnabled: true }, enabled: true }

function ctxWith(service: unknown) {
  return { service, config: resolveConfig({ enabled: true } as never), session: 'session:test', sessionId: 'test', agent: undefined, signal: new AbortController().signal } as never
}

test('observe.read: plain calls keep the old read path; sections reach the observer; a bad limit is INVALID_ARGS', async () => {
  const seen: unknown[] = []
  const service = {
    read: async (opts: unknown) => { seen.push(['read', opts]); return { url: 'http://x/', title: 'T', text: 'hello' } },
    observe: async (opts: unknown) => { seen.push(['observe', opts]); return { url: 'http://x/', title: 'T', controls: [] } },
  }
  assert.equal((await runAction('observe.read', {}, ctxWith(service), ENV)).ok, true)
  const reply = await runAction('observe.read', { sections: ['controls', 'links'], locator: { role: 'form' }, maxItems: 5, maxBytes: 4000, includeValues: true }, ctxWith(service), ENV)
  assert.equal(reply.ok, true)
  assert.deepEqual(seen, [
    ['read', { session: 'session:test' }],
    ['observe', { sections: ['controls', 'links'], target: { role: 'form' }, maxItems: 5, maxBytes: 4000, includeValues: true, session: 'session:test' }],
  ])
  const unknownSection = await runAction('observe.read', { sections: ['forms'] }, ctxWith(service), ENV)
  assert.equal(unknownSection.error?.code, 'INVALID_ARGS')
  // The limits are checked by the observer; the executor turns them into INVALID_ARGS too.
  const failing = { observe: async () => { normalizeObserve({ maxItems: 9_999 }) } }
  const tooMany = await runAction('observe.read', { sections: ['controls'], maxItems: 9_999 }, ctxWith(failing), ENV)
  assert.equal(tooMany.error?.code, 'INVALID_ARGS')
  assert.match(tooMany.error!.message, /maxItems/)
  const both = await runAction('observe.read', { sections: ['controls'], selector: '#a', locator: { text: 'x' } }, ctxWith(service), ENV)
  assert.equal(both.error?.code, 'INVALID_ARGS')
  assert.deepEqual(Object.keys(findAction('observe.read')!.topics!).sort(), ['controls', 'links', 'tables', 'truncation'])
})

