import test from 'node:test'
import assert from 'node:assert/strict'
import os from 'node:os'
import { BrowserService } from '../src/browser-service.ts'
import { resolveConfig } from '../src/config.ts'
import { mapError } from '../src/actions/errors.ts'
import { runAction } from '../src/actions/run.ts'
import { ACTIONS, findAction } from '../src/actions/registry.ts'
import { validateArgs } from '../src/actions/schema.ts'
import { TargetStaleError } from '../src/locator.ts'

/** A page that records its event handlers, so a test can emit navigation events by hand. */
function stubPage() {
  const handlers = new Map<string, ((...args: any[]) => void)[]>()
  const main = { name: 'main' }
  const sub = { name: 'sub' }
  const clicks: string[] = []
  const locator = { click: async () => { clicks.push('click') } }
  const page = {
    on: (event: string, handler: (...args: any[]) => void) => { handlers.set(event, [...handlers.get(event) ?? [], handler]) },
    mainFrame: () => main,
    isClosed: () => false,
    url: () => 'http://stub/',
    title: async () => 'Stub',
    setDefaultTimeout: () => {},
    evaluate: async () => ({ title: 'Stub', text: 'body' }),
    waitForTimeout: async () => {},
    screenshot: async () => Buffer.alloc(0),
    locator: () => locator,
  }
  const emit = (event: string, ...args: any[]) => { for (const handler of handlers.get(event) ?? []) handler(...args) }
  return { page, main, sub, emit, clicks }
}

function serviceWith(pages: ReturnType<typeof stubPage>[]) {
  const service = new BrowserService(resolveConfig({ enabled: true, snapshotDir: os.tmpdir() } as never))
  const internals = service as any
  internals.browser = { isConnected: () => true }
  const state = internals.state('session:gen')
  state.context = { on: () => {} }
  for (const entry of pages) internals.trackPage(state, entry.page)
  state.page = pages[0]!.page
  return { service, state }
}

test('a page generation changes on a main-frame navigation only, and never repeats inside a session', async () => {
  const first = stubPage()
  const popup = stubPage()
  const { service } = serviceWith([first, popup])
  const read = async () => (await service.read({ session: 'session:gen' }))
  const before = await read()
  assert.equal(before.targetId, 't1')
  assert.equal(typeof before.generation, 'number')

  first.emit('framenavigated', first.sub)
  assert.equal((await read()).generation, before.generation, 'a subframe navigation does not outdate the page')

  first.emit('framenavigated', first.main)
  const afterOne = (await read()).generation!
  assert.ok(afterOne > before.generation!)
  first.emit('framenavigated', first.main)
  assert.ok((await read()).generation! > afterOne, 'every committed main-frame navigation counts, same-document ones included')

  const targets = (await service.listTargets({ session: 'session:gen' })).targets
  assert.equal(new Set(targets.map(target => target.generation)).size, 2, 'two pages never share a generation')
  assert.equal(targets[0]!.generation, (await read()).generation)
  assert.ok(targets[1]!.generation !== targets[0]!.generation)
})

test('expectGeneration refuses a stale page before doing anything, and lets a current one through', async () => {
  const entry = stubPage()
  const { service } = serviceWith([entry])
  const { generation } = await service.read({ session: 'session:gen' })
  entry.emit('framenavigated', entry.main)

  const stale = await service.click('#go', { expectGeneration: generation!, session: 'session:gen' }).catch(error => error)
  assert.ok(stale instanceof TargetStaleError)
  assert.deepEqual(entry.clicks, [], 'the click was not attempted')
  const body = mapError(stale, 'act.click')
  assert.equal(body.code, 'TARGET_STALE')
  assert.deepEqual(body.current, { targetId: 't1', generation: generation! + 1 })
  assert.match(body.hint!, /observe\.read/)

  const fresh = await service.click('#go', { expectGeneration: generation! + 1, session: 'session:gen' })
  assert.equal(fresh.generation, generation! + 1)
  assert.deepEqual(entry.clicks, ['click'])
  // Without the argument nothing is checked: the guard is opt-in.
  await service.click('#go', { session: 'session:gen' })
  assert.equal(entry.clicks.length, 2)
})

test('the envelope for a stale call is failed with TARGET_STALE and the current generation', async () => {
  const entry = stubPage()
  const { service } = serviceWith([entry])
  const { generation } = await service.read({ session: 'session:gen' })
  entry.emit('framenavigated', entry.main)
  const ctx = { service, config: resolveConfig({ enabled: true } as never), session: 'session:gen', sessionId: 'gen', agent: undefined, signal: new AbortController().signal } as never
  const env = { mode: 'unrestricted' as const, options: {} as never, enabled: true }
  const reply = await runAction('act.click', { selector: '#go', expectGeneration: generation }, ctx, env)
  assert.equal(reply.ok, false)
  assert.equal(reply.executionStatus, 'failed')
  assert.equal(reply.error?.code, 'TARGET_STALE')
  assert.equal(reply.error?.current?.targetId, 't1')
  assert.equal(entry.clicks.length, 0)
})

test('every act action that changes or presses into the page accepts expectGeneration; recipes and reads do not', () => {
  const accepting = ACTIONS.filter(action => action.params.expectGeneration).map(action => action.name).sort()
  assert.deepEqual(accepting, ['act.check', 'act.clear', 'act.click', 'act.fill', 'act.hover', 'act.press', 'act.scroll', 'act.select', 'act.type', 'act.upload'])
  assert.deepEqual(validateArgs(findAction('act.click')!.params, { selector: '#a', expectGeneration: 3 }).errors, [])
  assert.match(validateArgs(findAction('act.click')!.params, { selector: '#a', expectGeneration: 'x' }).errors[0]!, /expected number/)
  for (const name of ['automation.run', 'automation.run_recipe']) assert.equal(findAction(name)!.params.expectGeneration, undefined, `${name}: a recipe re-binds the page on every run`)
})
