/**
 * Cross-session isolation for the interactive browser surface.
 *
 * The bug this pins: one `BrowserService` instance is shared by every
 * consumer, and it held a single `activePage`. With two sessions running at
 * once, whichever called `browser_open` last owned the page, so the other
 * session's `browser_read` / `browser_evaluate` / `browser_console` operated on
 * a page it never opened — including the other session's cookies and DOM.
 *
 * The fix keys the page, its context and its capture buffers by session, while
 * deliberately sharing one browser process.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { BrowserService, sessionKeyFor } from '../src/browser-service.ts'
import { resolveConfig } from '../src/config.ts'

function makeService(overrides: Record<string, unknown> = {}): BrowserService {
  return new BrowserService(resolveConfig({ enabled: true, verbose: false, ...overrides } as never))
}

/** A tool execution carrying a given session identity, as the agent loop sets it. */
function execFor(sessionId: string): { agent: { session: { id: string }; id: string } } {
  // Both shapes must agree: the live face exposes `session.id`, the base
  // contract documents `id`. `sessionKeyFor` tries the former first.
  return { agent: { session: { id: sessionId }, id: sessionId } as never }
}

test('sessionKeyFor prefers the live session id, falls back to the agent id, and buckets a missing agent', () => {
  assert.equal(sessionKeyFor({ session: { id: 's1' }, id: 'other' } as never), 'session:s1')
  assert.equal(sessionKeyFor({ id: 's2' } as never), 'session:s2')
  assert.equal(sessionKeyFor(undefined), 'shared')
  assert.equal(sessionKeyFor({} as never), 'shared')
  // A blank id must not become its own bucket, or every call would look new.
  assert.equal(sessionKeyFor({ id: '' } as never), 'shared')
})

test('two sessions get their own page, context and cookies', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-browser-iso-'))
  // One server, two pages. A cookie set on /a must be invisible to a context
  // that only ever visited /b — this is what "own context" buys over "own tab".
  const server = http.createServer((req, res) => {
    if (req.url === '/a') {
      res.setHeader('set-cookie', 'secret=from-a; Path=/')
      res.setHeader('content-type', 'text/html')
      res.end('<title>page-a</title><p>alpha</p>')
      return
    }
    res.setHeader('content-type', 'text/html')
    res.end('<title>page-b</title><p>bravo</p>')
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const port = (server.address() as { port: number }).port
  const service = makeService({ headless: true, snapshotDir: dir, storageStatePath: undefined })

  t.after(async () => {
    await service.close()
    await new Promise<void>(resolve => server.close(() => resolve()))
  })

  const a = sessionKeyFor(execFor('session-A').agent)
  const b = sessionKeyFor(execFor('session-B').agent)
  assert.notEqual(a, b, 'two sessions must key differently')

  // Both sessions open a page. Before the fix, the second open() would have
  // stolen the first session's page.
  const stateA = await service.open(`http://127.0.0.1:${port}/a`, { session: a })
  const stateB = await service.open(`http://127.0.0.1:${port}/b`, { session: b })
  assert.equal(stateA.title, 'page-a')
  assert.equal(stateB.title, 'page-b')

  // Each session still reads ITS OWN page, not the most recently opened one.
  // Opening B after A is exactly the ordering that used to cross the wires.
  assert.equal((await service.read({ session: a })).title, 'page-a')
  assert.equal((await service.read({ session: b })).title, 'page-b')

  // Cookie isolation: A's cookie must not be visible to B. `evaluate` reports
  // the expression's value as a JSON string in `resultJson`.
  const cookieOf = async (session: string) =>
    JSON.parse((await service.evaluate('document.cookie', { session })).resultJson) as string
  const cookieA = await cookieOf(a)
  const cookieB = await cookieOf(b)
  assert.match(cookieA, /secret=from-a/)
  assert.doesNotMatch(cookieB, /secret=from-a/)

  // status() reports only the caller's page, so sessions cannot observe each other.
  assert.equal((await service.status({ session: a })).activeUrl, `http://127.0.0.1:${port}/a`)
  assert.equal((await service.status({ session: b })).activeUrl, `http://127.0.0.1:${port}/b`)

  // A session with no page of its own reports none, even while others do.
  const c = sessionKeyFor(execFor('session-C').agent)
  assert.equal((await service.status({ session: c })).activeUrl, undefined)
})

test('browser_close closes only the calling session and persists that session state', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-browser-close-'))
  const server = http.createServer((_req, res) => {
    res.setHeader('content-type', 'text/html')
    res.end('<title>page</title><p>content</p>')
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const port = (server.address() as { port: number }).port
  const service = makeService({ headless: true, snapshotDir: dir, storageStatePath: undefined })

  t.after(async () => {
    await service.close()
    await new Promise<void>(resolve => server.close(() => resolve()))
  })

  const a = sessionKeyFor(execFor('session-A').agent)
  const b = sessionKeyFor(execFor('session-B').agent)
  await service.open(`http://127.0.0.1:${port}/`, { session: a })
  await service.open(`http://127.0.0.1:${port}/`, { session: b })

  // The tool path: closePage via the session's own state bucket.
  await service.closePage(service.sessionState(execFor('session-A').agent))

  assert.equal((await service.status({ session: a })).activeUrl, undefined, 'A must lose its page')
  assert.equal((await service.status({ session: b })).activeUrl, `http://127.0.0.1:${port}/`, 'B must keep its page')
  // B is still operable, which is the point: one session's cleanup is local.
  assert.equal((await service.read({ session: b })).title, 'page')
})

test('capture buffers are per session, so console output cannot cross over', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-browser-capture-'))
  const server = http.createServer((req, res) => {
    res.setHeader('content-type', 'text/html')
    res.end(`<title>capture</title><script>console.log('log-from-${req.url.slice(1)}')</script>`)
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const port = (server.address() as { port: number }).port
  const service = makeService({ headless: true, snapshotDir: dir, storageStatePath: undefined })

  t.after(async () => {
    await service.close()
    await new Promise<void>(resolve => server.close(() => resolve()))
  })

  const a = sessionKeyFor(execFor('session-A').agent)
  const b = sessionKeyFor(execFor('session-B').agent)
  await service.open(`http://127.0.0.1:${port}/a`, { session: a, capture: ['console'] })
  await service.open(`http://127.0.0.1:${port}/b`, { session: b, capture: ['console'] })
  // Give both console listeners a moment to drain.
  await new Promise(resolve => setTimeout(resolve, 500))

  const logsA = service.consoleMessages({ session: a })
  const logsB = service.consoleMessages({ session: b })
  assert.equal(logsA.enabled, true)
  assert.equal(logsB.enabled, true)
  const textA = logsA.records.map(r => r.text).join('\n')
  const textB = logsB.records.map(r => r.text).join('\n')
  assert.match(textA, /log-from-a/)
  assert.doesNotMatch(textA, /log-from-b/)
  assert.match(textB, /log-from-b/)
  assert.doesNotMatch(textB, /log-from-a/)

  // A session that never captured must not read another's records.
  const c = sessionKeyFor(execFor('session-C').agent)
  const logsC = service.consoleMessages({ session: c })
  assert.equal(logsC.enabled, false)
  assert.deepEqual(logsC.records, [])
})

test('sessions beyond the limit evict the least recently used, and never the caller', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-browser-evict-'))
  const server = http.createServer((_req, res) => {
    res.setHeader('content-type', 'text/html')
    res.end('<title>evict</title><p>x</p>')
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const port = (server.address() as { port: number }).port
  const service = makeService({ headless: true, snapshotDir: dir, storageStatePath: undefined, maxSessions: 2 })

  t.after(async () => {
    await service.close()
    await new Promise<void>(resolve => server.close(() => resolve()))
  })

  const key = (n: string) => sessionKeyFor(execFor(n).agent)
  await service.open(`http://127.0.0.1:${port}/`, { session: key('one') })
  await service.open(`http://127.0.0.1:${port}/`, { session: key('two') })
  // A third session exceeds the limit of 2, so the oldest (one) is closed.
  await service.open(`http://127.0.0.1:${port}/`, { session: key('three') })
  // Give the async eviction a turn to finish.
  await new Promise(resolve => setTimeout(resolve, 300))

  assert.equal((await service.status({ session: key('one') })).activeUrl, undefined, 'oldest session evicted')
  assert.ok((await service.status({ session: key('two') })).activeUrl, 'recent session kept')
  assert.ok((await service.status({ session: key('three') })).activeUrl, 'newest session kept')
})

test('a session keeps its page across turns and a non-session caller keeps working', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-browser-shared-'))
  const server = http.createServer((_req, res) => {
    res.setHeader('content-type', 'text/html')
    res.end('<title>stable</title><p>content</p>')
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const port = (server.address() as { port: number }).port
  const service = makeService({ headless: true, snapshotDir: dir, storageStatePath: undefined })

  t.after(async () => {
    await service.close()
    await new Promise<void>(resolve => server.close(() => resolve()))
  })

  const a = sessionKeyFor(execFor('session-A').agent)
  await service.open(`http://127.0.0.1:${port}/`, { session: a })
  // "Same session, later turn": a fresh exec object, same session id.
  const laterTurn = sessionKeyFor(execFor('session-A').agent)
  assert.equal(laterTurn, a)
  assert.ok((await service.status({ session: laterTurn })).activeUrl, 'page survives across turns')

  // A consumer with no agent (e.g. another plugin calling the service directly)
  // still works, via the shared bucket — this is the pre-existing contract.
  await service.open(`http://127.0.0.1:${port}/`, { session: sessionKeyFor(undefined) })
  assert.ok((await service.status({ session: sessionKeyFor(undefined) })).activeUrl)
  // And it did not disturb the real session.
  assert.ok((await service.status({ session: a })).activeUrl)
})
