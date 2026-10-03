/**
 * Real-browser tests for page generations: which events outdate an observation, and that a stale
 * `expectGeneration` refuses an action before anything happens (proved from the server side).
 * Skipped with a printed reason when no browser exists; nothing is downloaded.
 */
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createHarness, detectBrowser, startFixtureServer, type Harness } from './support.ts'

const detection = detectBrowser()
if (!detection.ok) console.log(`[e2e:generation] SKIPPED: ${detection.reason}`)

describe('dsh-browser page generation in a real browser', { skip: detection.ok ? false : detection.reason }, () => {
  let harness: Harness
  let server: Awaited<ReturnType<typeof startFixtureServer>>
  const S = 'e2e-generation'
  const url = (page: string) => `${server.base}/${page}`

  before(async () => {
    assert.ok(detection.ok)
    server = await startFixtureServer()
    harness = createHarness(detection)
  })

  after(async () => {
    await harness?.dispose()
    await server?.close()
  })

  const generation = async (session = S): Promise<number> => (await harness.result(session, 'observe.read')).generation
  /** Run page code that navigates later, so the evaluation itself is not torn down with the old document. */
  const later = (code: string) => harness.result(S, 'script.evaluate', { expression: `setTimeout(() => { ${code} }, 0) && 1` })
  async function changed(from: number): Promise<number> {
    for (let attempt = 0; attempt < 40; attempt += 1) {
      // A read that lands in the middle of the navigation fails; try again.
      const now = await generation().catch(() => from)
      if (now !== from) return now
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    return from
  }

  it('every page state carries targetId and generation, and target.list shows the generation', async () => {
    const opened = await harness.result(S, 'target.open', { url: url('form.html') })
    assert.equal(opened.targetId, 't1')
    assert.equal(typeof opened.generation, 'number')
    const states = [
      await harness.result(S, 'observe.read'),
      await harness.result(S, 'act.fill', { locator: { label: 'Name' }, text: 'Ada' }),
      await harness.result(S, 'act.clear', { locator: { label: 'Name' } }),
      await harness.result(S, 'act.type', { locator: { label: 'Name' }, text: 'x' }),
      await harness.result(S, 'act.press', { key: 'Tab' }),
      await harness.result(S, 'act.hover', { selector: '#inc' }),
      await harness.result(S, 'act.scroll', { deltaY: 10 }),
      await harness.result(S, 'act.wait', { timeMs: 10 }),
      await harness.result(S, 'act.click', { selector: '#inc' }),
    ]
    for (const state of states) assert.deepEqual([state.targetId, state.generation], [opened.targetId, opened.generation], 'no navigation happened, so the generation is unchanged')
    const [listed] = (await harness.result(S, 'target.list')).targets
    assert.deepEqual([listed.id, listed.generation], [opened.targetId, opened.generation])
    const selected = await harness.result(S, 'target.select', { id: 't1' })
    assert.deepEqual([selected.targetId, selected.generation], [opened.targetId, opened.generation])
    // A recipe reports the page it ended on but does not take the guard: it binds the page itself on every run.
    const recipe = await harness.action(S, 'automation.run_recipe', { steps: [{ type: 'wait', condition: 'time', waitMs: 1 }], expectGeneration: 1 })
    assert.equal(recipe.ok, false)
    assert.equal(recipe.error.code, 'INVALID_ARGS')
    assert.match(recipe.error.message, /expectGeneration: unknown argument/)
  })

  it('main-frame navigations outdate the page; re-rendering and subframe navigation do not', async () => {
    await harness.result(S, 'target.open', { url: url('generation.html') })
    const log: Record<string, [number, number]> = {}
    for (const id of ['push', 'replace', 'hash', 'assign']) {
      const was = await generation()
      const result = await harness.result(S, 'act.click', { selector: `#${id}` })
      log[id] = [was, result.generation]
      assert.ok(result.generation > was, `${id}: a navigation commit must bump the generation (${was} -> ${result.generation})`)
    }
    // History moves and reload, driven from the page, on the page that is now index.html.
    const beforeBack = await generation()
    await later('history.back()')
    const afterBack = await changed(beforeBack)
    assert.ok(afterBack > beforeBack, 'history.back')
    await later('history.forward()')
    const afterForward = await changed(afterBack)
    assert.ok(afterForward > afterBack, 'history.forward')
    await later('location.reload()')
    const afterReload = await changed(afterForward)
    assert.ok(afterReload > afterForward, 'reload')

    // Not triggers: a DOM re-render and a navigation of a child frame leave the generation alone.
    await harness.result(S, 'target.open', { url: url('generation.html') })
    const settled = await generation()
    const rerender = await harness.result(S, 'act.click', { selector: '#rerender' })
    assert.match(rerender.text, /render 1/)
    assert.equal(rerender.generation, settled, 'DOM re-render')
    const subframe = await harness.result(S, 'act.click', { selector: '#subframe' })
    await new Promise(resolve => setTimeout(resolve, 400))
    assert.equal(await generation(), settled, 'subframe navigation')
    assert.equal(subframe.generation, settled)
  })

  it('a stale expectGeneration returns TARGET_STALE and the backend never sees the action', async () => {
    await harness.result(S, 'target.open', { url: url('generation.html') })
    const observed = await generation()
    await harness.result(S, 'act.click', { selector: '#push' })
    const now = await generation()
    assert.ok(now > observed)

    server.resetHits()
    const stale = await harness.action(S, 'act.click', { selector: '#submit', expectGeneration: observed })
    assert.equal(stale.ok, false)
    assert.equal(stale.executionStatus, 'failed')
    assert.equal(stale.error.code, 'TARGET_STALE')
    assert.deepEqual(stale.error.current, { targetId: 't1', generation: now })
    assert.match(stale.error.hint, /observe\.read/)
    await new Promise(resolve => setTimeout(resolve, 300))
    assert.deepEqual(server.hits(), {}, 'the click was not performed')

    // Every guarded action refuses the same way; the page text is untouched.
    for (const [action, args] of [
      ['act.fill', { selector: '#submit', text: 'x' }], ['act.type', { selector: '#submit', text: 'x' }], ['act.clear', { selector: '#submit' }],
      ['act.press', { key: 'Enter' }], ['act.hover', { selector: '#submit' }], ['act.check', { selector: '#submit' }], ['act.scroll', { deltaY: 5 }],
    ] as const) {
      const refused = await harness.action(S, action, { ...args, expectGeneration: observed })
      assert.equal(refused.error?.code, 'TARGET_STALE', action)
    }

    // Re-observing gives the new generation, and acting with it works and reaches the backend once.
    const fresh = await harness.result(S, 'observe.read')
    assert.equal(fresh.generation, now)
    await harness.result(S, 'act.click', { selector: '#submit', expectGeneration: fresh.generation })
    await new Promise(resolve => setTimeout(resolve, 300))
    assert.deepEqual(server.hits(), { submit: 1 })
  })

  it('another page of the same session never matches by coincidence', async () => {
    await harness.result(S, 'target.close')
    await harness.result(S, 'target.open', { url: url('popup-opener.html') })
    const opener = await harness.result(S, 'observe.read')
    await harness.result(S, 'act.click', { locator: { role: 'link', name: 'Open child' } })
    let targets: any[] = []
    for (let attempt = 0; attempt < 30 && targets.length < 2; attempt += 1) {
      targets = (await harness.result(S, 'target.list')).targets
      if (targets.length < 2) await new Promise(resolve => setTimeout(resolve, 100))
    }
    assert.equal(targets.length, 2)
    assert.equal(new Set(targets.map(target => target.generation)).size, 2)
    const child = targets.find(target => target.id !== opener.targetId)
    await harness.result(S, 'target.select', { id: child.id })
    const stale = await harness.action(S, 'act.click', { selector: '#ping', expectGeneration: opener.generation })
    assert.equal(stale.error?.code, 'TARGET_STALE', 'the opener generation is not the popup generation')
    assert.equal(stale.error.current.targetId, child.id)
  })
})
