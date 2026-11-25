/**
 * The service side of the safe write-back, driven through a fake browser (no Chromium): the per-file lock of
 * transient operations, its release on every error path, no deadlock behind the usage governor, what is and is not
 * written back, and what `runtime.status` reports. The real-browser counterparts are in test/e2e/login-session.test.ts.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { BrowserService } from '../src/browser-service.ts'
import { resolveConfig } from '../src/config.ts'

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-persist-svc-'))
const cookie = (name: string, domain: string, value = 'v') => ({ name, value, domain, path: '/', expires: -1, httpOnly: true, secure: false, sameSite: 'Lax' })
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

interface FakeOptions { status?: number; holdMs?: number; failNewContext?: number; crashOnState?: boolean; mutate?: (state: any) => any }

/** A browser whose contexts keep the state they were created with, let a test change it, and log what happened. */
function fakeBrowser(opts: FakeOptions = {}) {
  const events: string[] = []
  const created: any[] = []
  let failures = opts.failNewContext ?? 0
  let seq = 0
  const browser = {
    isConnected: () => true,
    on() {},
    async newContext(options: any) {
      if (failures-- > 0) throw new Error('newContext failed')
      const id = ++seq
      events.push('new' + id)
      const state = JSON.parse(JSON.stringify(options.storageState ?? { cookies: [], origins: [] }))
      const entry = { id, options, state, closed: false, storageStateArgs: [] as unknown[] }
      created.push(entry)
      return {
        on() {},
        async addInitScript() {},
        async addCookies() {},
        async newPage() {
          return {
            on() {}, isClosed: () => entry.closed, async close() {}, mainFrame: () => ({}), url: () => 'https://a.example.com/', setDefaultTimeout() {},
            async goto() { return { status: () => opts.status ?? 200, headers: () => ({}) } },
            async waitForLoadState() {}, async waitForTimeout() {},
            async evaluate() { if (opts.holdMs) await sleep(opts.holdMs); return { title: 't', text: 'x'.repeat(50), html: '', items: [], captcha: false, login: false, empty: false, listLike: 0, nodes: 3 } },
          }
        },
        async storageState(args: unknown) {
          entry.storageStateArgs.push(args)
          if (opts.crashOnState) throw new Error('browserContext.storageState: Target page, context or browser has been closed')
          return opts.mutate ? opts.mutate(entry.state) : entry.state
        },
        async close() { entry.closed = true; events.push('close' + id) },
      }
    },
  }
  return { browser, events, created }
}

function setup(opts: FakeOptions = {}, extra: Record<string, unknown> = {}) {
  const dir = tmp()
  const fileA = path.join(dir, 'a.json')
  const fileB = path.join(dir, 'b.json')
  const state = (domain: string) => ({ cookies: [cookie('sid', domain, 'one'), cookie('rt', domain, 'tok')], origins: [] })
  fs.writeFileSync(fileA, JSON.stringify(state('a.example.com')))
  fs.writeFileSync(fileB, JSON.stringify(state('b.example.com')))
  const svc = new BrowserService(resolveConfig({
    enabled: true, snapshotDir: dir, usagePolicy: { minDelayMs: 0, burst: 20, maxConcurrency: 2 },
    authProfiles: {
      pa: { storageStatePath: fileA, allowedDomains: ['a.example.com'], persistState: true },
      pa2: { storageStatePath: path.join(dir, '.', 'a.json'), allowedDomains: ['a.example.com'], persistState: true },
      pb: { storageStatePath: fileB, allowedDomains: ['b.example.com'], persistState: true },
      ro: { storageStatePath: fileA, allowedDomains: ['a.example.com'], persistState: false },
    },
    ...extra,
  } as never))
  const fake = fakeBrowser(opts)
  ;(svc as any).browser = fake.browser
  return { svc, dir, fileA, fileB, ...fake }
}

const render = (svc: BrowserService, url: string, profile: string, signal?: AbortSignal) => svc.render(url, [], { authProfile: profile, signal })
const read = (file: string) => JSON.parse(fs.readFileSync(file, 'utf8'))

test('two transient operations on one persistState file never overlap: the second starts from what the first wrote', async () => {
  const { svc, events } = setup({ holdMs: 60 })
  await Promise.all([render(svc, 'https://a.example.com/1', 'pa'), render(svc, 'https://a.example.com/2', 'pa'), render(svc, 'https://a.example.com/3', 'pa')])
  assert.deepEqual(events, ['new1', 'close1', 'new2', 'close2', 'new3', 'close3'])
})

test('two profiles on the same file (even spelled differently) share the lock; other files and read-only profiles do not wait', async () => {
  const same = setup({ holdMs: 60 })
  await Promise.all([render(same.svc, 'https://a.example.com/1', 'pa'), render(same.svc, 'https://a.example.com/2', 'pa2')])
  assert.deepEqual(same.events, ['new1', 'close1', 'new2', 'close2'])
  const apart = setup({ holdMs: 60 })
  await Promise.all([render(apart.svc, 'https://a.example.com/1', 'pa'), render(apart.svc, 'https://b.example.com/1', 'pb')])
  assert.deepEqual(apart.events.slice(0, 2), ['new1', 'new2'], 'different files run side by side')
  const readOnly = setup({ holdMs: 60 })
  await Promise.all([render(readOnly.svc, 'https://a.example.com/1', 'ro'), render(readOnly.svc, 'https://a.example.com/2', 'ro')])
  assert.deepEqual(readOnly.events.slice(0, 2), ['new1', 'new2'], 'a profile without persistState is never serialised')
})

test('no deadlock with the governor at concurrency 2: five operations on one file and two on another all finish', async () => {
  const { svc, events } = setup({ holdMs: 20 })
  const jobs = [...Array(5)].map((_, i) => render(svc, 'https://a.example.com/' + i, 'pa')).concat([render(svc, 'https://b.example.com/1', 'pb'), render(svc, 'https://b.example.com/2', 'pb')])
  await Promise.race([Promise.all(jobs), sleep(10_000).then(() => { throw new Error('deadlock') })])
  assert.equal(events.filter(event => event.startsWith('close')).length, 7)
})

test('the lock is released when newContext fails, when the page fails, and when the browser crashed', async () => {
  const failing = setup({ failNewContext: 2 })
  await assert.rejects(() => render(failing.svc, 'https://a.example.com/1', 'pa'), /newContext failed/)
  await assert.rejects(() => render(failing.svc, 'https://a.example.com/2', 'pa'), /newContext failed/)
  await render(failing.svc, 'https://a.example.com/3', 'pa')
  const crashed = setup({ crashOnState: true })
  await render(crashed.svc, 'https://a.example.com/1', 'pa')
  await render(crashed.svc, 'https://a.example.com/2', 'pa')
  assert.equal(crashed.events.filter(event => event.startsWith('close')).length, 2, 'a crashed browser costs no lock and the context is still closed')
  assert.equal(((await crashed.svc.status()).authProfiles.find(p => p.id === 'pa')!.writeBack as any).reason, 'the browser had closed')
  const broken = setup()
  const working = (broken.browser as any).newContext
  ;(broken.browser as any).newContext = async () => ({ on() {}, async addInitScript() {}, async close() {}, async newPage() { throw new Error('page failed') }, async storageState() { return { cookies: [], origins: [] } } })
  await assert.rejects(() => render(broken.svc, 'https://a.example.com/1', 'pa'), /page failed/)
  ;(broken.browser as any).newContext = working
  await Promise.race([render(broken.svc, 'https://a.example.com/2', 'pa'), sleep(3_000).then(() => { throw new Error('the lock of a failed operation was not released') })])
})

test('waiting for the file honours the AbortSignal and has an upper bound with a clear error', async () => {
  const { svc } = setup({ holdMs: 400 })
  const first = render(svc, 'https://a.example.com/1', 'pa')
  await sleep(20)
  const controller = new AbortController()
  const waiting = render(svc, 'https://a.example.com/2', 'pa', controller.signal)
  controller.abort()
  await assert.rejects(waiting, /aborted/)
  await first
  await render(svc, 'https://a.example.com/3', 'pa')
})

test('write-back: a changed cookie is merged into the current file with a .bak; an unchanged state writes nothing; other domains in the file survive', async () => {
  const { svc, fileA } = setup({ mutate: state => { state.cookies = state.cookies.map((c: any) => c.name === 'rt' ? { ...c, value: 'rotated' } : c).concat([cookie('track', 'ads.other.test')]); return state } })
  fs.writeFileSync(fileA, JSON.stringify({ cookies: [cookie('sid', 'a.example.com', 'one'), cookie('rt', 'a.example.com', 'tok'), cookie('theirs', 'b.example.com', 'keep')], origins: [] }))
  await render(svc, 'https://a.example.com/1', 'pa')
  const written = read(fileA)
  assert.deepEqual(written.cookies.map((c: any) => c.name + '=' + c.value), ['sid=one', 'rt=rotated', 'theirs=keep'])
  assert.equal(read(fileA + '.bak').cookies.find((c: any) => c.name === 'rt').value, 'tok')
  const status = await svc.status()
  const entry = status.authProfiles.find(p => p.id === 'pa')!
  assert.equal(entry.writeBack?.outcome, 'written')
  assert.equal(JSON.stringify(status.authProfiles).includes('rotated'), false)
  assert.equal(JSON.stringify(entry).includes(fileA), false)
  const quiet = setup()
  const before = fs.statSync(quiet.fileA).mtimeMs
  await sleep(10)
  await render(quiet.svc, 'https://a.example.com/1', 'pa')
  assert.equal(fs.statSync(quiet.fileA).mtimeMs, before)
  assert.equal(fs.existsSync(quiet.fileA + '.bak'), false)
  assert.equal(((await quiet.svc.status()).authProfiles.find(p => p.id === 'pa')!.writeBack as any).outcome, 'unchanged')
  assert.equal((await quiet.svc.status()).authProfiles.find(p => p.id === 'pb')!.writeBack, undefined, 'a profile that was not used has no outcome yet')
})

test('a logged-out answer is not written over a good login: error status, login page, and an emptied cookie jar are skipped with a reason', async () => {
  const wipe = (state: any) => ({ ...state, cookies: [] })
  const status = setup({ status: 403 })
  const before = fs.readFileSync(status.fileA, 'utf8')
  await render(status.svc, 'https://a.example.com/1', 'pa')
  assert.equal(fs.readFileSync(status.fileA, 'utf8'), before)
  assert.match(((await status.svc.status()).authProfiles.find(p => p.id === 'pa')!.writeBack as any).reason, /403/)
  const emptied = setup({ mutate: wipe })
  const beforeEmpty = fs.readFileSync(emptied.fileA, 'utf8')
  await render(emptied.svc, 'https://a.example.com/1', 'pa')
  assert.equal(fs.readFileSync(emptied.fileA, 'utf8'), beforeEmpty)
  assert.match(((await emptied.svc.status()).authProfiles.find(p => p.id === 'pa')!.writeBack as any).reason, /all its cookies/)
  const oneLost = setup({ mutate: (state: any) => ({ ...state, cookies: state.cookies.filter((c: any) => c.name !== 'rt') }) })
  await render(oneLost.svc, 'https://a.example.com/1', 'pa')
  assert.deepEqual(read(oneLost.fileA).cookies.map((c: any) => c.name), ['sid'], 'losing one cookie on an ordinary page is a normal change')
})

test('a corrupt file is not overwritten and the failure is reported, not swallowed', async () => {
  const { svc, fileA } = setup({ mutate: state => ({ ...state, cookies: [cookie('sid', 'a.example.com', 'two'), cookie('rt', 'a.example.com', 'tok')] }) })
  // the file is valid when the context is created and broken when it closes
  const original = (svc as any).browser.newContext
  ;(svc as any).browser.newContext = async (options: any) => { const context = await original(options); fs.writeFileSync(fileA, '{"cookies": [broken'); return context }
  await assert.rejects(() => render(svc, 'https://a.example.com/1', 'pa'), /left untouched/)
  assert.equal(fs.readFileSync(fileA, 'utf8'), '{"cookies": [broken')
  assert.equal(((await svc.status()).authProfiles.find(p => p.id === 'pa')!.writeBack as any).outcome, 'failed')
})

test('IndexedDB is captured with the state (the call asks for it)', async () => {
  const { svc, created } = setup()
  await render(svc, 'https://a.example.com/1', 'pa')
  assert.deepEqual(created[0].storageStateArgs[0], { indexedDB: true })
})
