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


test('observe sections and generations add nothing to the always-on tools; they live in the listing and the details', async () => {
  const { registerTools } = await import('../src/tools.ts')
  const { renderIndex } = await import('../src/actions/index-view.ts')
  const tools: any[] = []
  registerTools({ tools: { register: (tool: any) => tools.push(tool) } } as never, resolveConfig({ automationMode: 'unrestricted', toolSurface: 'indexed' } as never), {} as never)
  const l0 = tools.reduce((sum, tool) => sum + JSON.stringify({ name: tool.name, description: tool.description, parameters: tool.parameters }).length, 0)
  // 1137 chars (325 tokens) when B5 started; the tool definitions must not grow with new actions or arguments.
  assert.ok(l0 <= 1_137, `L0 is ${l0} chars`)
  const env = { mode: 'unrestricted' as const, options: { modelDevelopmentEnabled: true }, enabled: true, skillAvailable: true }
  const group = renderIndex({ group: 'observe' }, env).text
  assert.match(group, /sections\?/)
  assert.match(renderIndex({ group: 'act' }, env).text, /expectGeneration\?: number/)
  assert.match(renderIndex({ action: 'observe.read' }, env).text, /observe\.read\.controls/)
})
