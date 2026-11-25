import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  KeyedMutex, StateLockError, applyDelta, captureStorageState, computeDelta, cookieKey, deletesAllCookies, mergeIntoFile, scopeState, stateFileKey, writeBackSkipReason,
  type StorageCookie, type StorageState,
} from '../src/auth-state.ts'

const cookie = (name: string, domain: string, value = 'v', extra: Partial<StorageCookie> = {}): StorageCookie => ({ name, value, domain, path: '/', expires: -1, httpOnly: true, secure: false, sameSite: 'Lax', ...extra })
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-auth-state-'))
const A = ['a.example.com']

test('cookie identity is name + domain + path + partition key; the domain ignores case but not the leading dot', () => {
  assert.equal(cookieKey(cookie('s', 'A.example.com')), cookieKey(cookie('s', 'a.example.com')))
  assert.notEqual(cookieKey(cookie('s', '.a.example.com')), cookieKey(cookie('s', 'a.example.com')))
  assert.notEqual(cookieKey(cookie('s', 'a.example.com', 'v', { path: '/x' })), cookieKey(cookie('s', 'a.example.com')))
  assert.notEqual(cookieKey(cookie('s', 'a.example.com', 'v', { partitionKey: 'https://top.example' })), cookieKey(cookie('s', 'a.example.com')))
})

test('scopeState keeps only the allowed domains and survives malformed entries', () => {
  const scoped = scopeState({ cookies: [cookie('a', 'a.example.com'), cookie('b', '.a.example.com'), cookie('c', 'b.example.com'), { name: 'x' } as any], origins: [{ origin: 'https://a.example.com' }, { origin: 'https://b.example.com' }, { origin: 'not a url' }] }, A)
  assert.deepEqual(scoped.cookies.map(entry => entry.name), ['a', 'b'])
  assert.deepEqual(scoped.origins.map(entry => entry.origin), ['https://a.example.com'])
  assert.deepEqual(scopeState(undefined, A), { cookies: [], origins: [] })
})

test('the delta holds changed and new cookies, deleted keys and local storage changes, and never a cookie of another domain', () => {
  const baseline: StorageState = { cookies: [cookie('keep', 'a.example.com'), cookie('rot', 'a.example.com', 'old'), cookie('gone', 'a.example.com')], origins: [{ origin: 'https://a.example.com', localStorage: [{ name: 'k', value: '1' }, { name: 'drop', value: 'x' }] }] }
  const current: StorageState = {
    cookies: [cookie('keep', 'a.example.com'), cookie('rot', 'a.example.com', 'new'), cookie('fresh', 'a.example.com'), cookie('tracker', 'ads.other.test')],
    origins: [{ origin: 'https://a.example.com', localStorage: [{ name: 'k', value: '2' }, { name: 'added', value: 'y' }] }, { origin: 'https://ads.other.test', localStorage: [{ name: 'z', value: '1' }] }],
  }
  const delta = computeDelta(baseline, current, A)
  assert.deepEqual(delta.cookieUpserts.map(entry => entry.name).sort(), ['fresh', 'rot'])
  assert.deepEqual(delta.cookieDeletes, [cookieKey(cookie('gone', 'a.example.com'))])
  assert.equal(delta.baselineCookies, 3)
  assert.equal(delta.origins.length, 1)
  assert.deepEqual(delta.origins[0]!.setLocal.map(entry => entry.name).sort(), ['added', 'k'])
  assert.deepEqual(delta.origins[0]!.deleteLocal, ['drop'])
  assert.equal(JSON.stringify(delta).includes('ads.other.test'), false)
})

test('an origin missing from the context state never deletes the origin in the file; IndexedDB is replaced only when captured and different', () => {
  const baseline: StorageState = { cookies: [], origins: [{ origin: 'https://a.example.com', localStorage: [{ name: 'k', value: '1' }], indexedDB: [{ name: 'db', version: 1, stores: [] }] }] }
  const none = computeDelta(baseline, { cookies: [], origins: [] }, A)
  assert.deepEqual(none.origins, [])
  const withoutIdb = computeDelta(baseline, { cookies: [], origins: [{ origin: 'https://a.example.com', localStorage: [{ name: 'k', value: '1' }] }] }, A)
  assert.deepEqual(withoutIdb.origins, [], 'IndexedDB that was not captured is not a deletion')
  const changed = computeDelta(baseline, { cookies: [], origins: [{ origin: 'https://a.example.com', localStorage: [{ name: 'k', value: '1' }], indexedDB: [{ name: 'db', version: 2, stores: [] }] }] }, A)
  assert.equal(changed.origins[0]!.indexedDB?.length, 1)
  const file: StorageState = { cookies: [], origins: [{ origin: 'https://a.example.com', localStorage: [{ name: 'k', value: '1' }], indexedDB: [{ name: 'db', version: 1, stores: [] }] }] }
  assert.deepEqual(applyDelta(file, none).origins, file.origins)
  assert.deepEqual(applyDelta(file, changed).origins![0]!.indexedDB, [{ name: 'db', version: 2, stores: [] }])
})

test('applying a delta leaves every other cookie and origin of the file exactly as it was, whatever the domain', () => {
  const foreign = cookie('theirs', 'b.example.com', 'secret', { expires: 1999999999, partitionKey: { topLevelSite: 'https://x.test', hasCrossSiteAncestor: false } })
  const file: StorageState = { extra: { keep: true }, cookies: [foreign, cookie('s', 'a.example.com', 'file-value')], origins: [{ origin: 'https://b.example.com', localStorage: [{ name: 'b', value: '1' }], indexedDB: [{ name: 'bdb' }] }] }
  const before = JSON.stringify(file)
  const delta = computeDelta({ cookies: [cookie('s', 'a.example.com', 'file-value')], origins: [] }, { cookies: [cookie('s', 'a.example.com', 'rotated'), cookie('t', 'a.example.com')], origins: [{ origin: 'https://a.example.com', localStorage: [{ name: 'n', value: '1' }] }] }, A)
  const merged = applyDelta(file, delta)
  assert.equal(JSON.stringify(file), before, 'the input is not mutated')
  assert.deepEqual(merged.cookies!.find(entry => entry.name === 'theirs'), foreign)
  assert.deepEqual(merged.origins!.find(entry => entry.origin === 'https://b.example.com'), file.origins![0])
  assert.deepEqual(merged.extra, { keep: true })
  assert.equal(merged.cookies!.find(entry => entry.name === 's')!.value, 'rotated')
  assert.equal(merged.cookies!.some(entry => entry.name === 't'), true)
  assert.equal(merged.origins!.find(entry => entry.origin === 'https://a.example.com')!.localStorage![0]!.name, 'n')
})

test('the delta applies to the file as it is NOW: a site that changed the file since the context was created is not undone', () => {
  const baseline: StorageState = { cookies: [cookie('a1', 'a.example.com')], origins: [] }
  const delta = computeDelta(baseline, { cookies: [cookie('a1', 'a.example.com', 'rotated')], origins: [] }, A)
  const newer: StorageState = { cookies: [cookie('a1', 'a.example.com'), cookie('b1', 'b.example.com', 'added-meanwhile')], origins: [] }
  const merged = applyDelta(newer, delta)
  assert.deepEqual(merged.cookies!.map(entry => entry.name + '=' + entry.value), ['a1=rotated', 'b1=added-meanwhile'])
})

test('skip rules: interactive writes anything; transient refuses a bad answer, an error status, a login page that cost a cookie, and an empty-out', () => {
  const baseline: StorageState = { cookies: [cookie('a', 'a.example.com'), cookie('b', 'a.example.com')], origins: [] }
  const one = computeDelta(baseline, { cookies: [cookie('a', 'a.example.com')], origins: [] }, A)
  const all = computeDelta(baseline, { cookies: [], origins: [] }, A)
  const none = computeDelta(baseline, baseline, A)
  assert.equal(deletesAllCookies(all), true)
  assert.equal(deletesAllCookies(one), false)
  assert.equal(deletesAllCookies(computeDelta({ cookies: [], origins: [] }, { cookies: [], origins: [] }, A)), false, 'an empty baseline loses nothing')
  assert.equal(writeBackSkipReason(false, { skip: 'x', status: 500, loginSignal: true }, all), undefined, 'interactive sessions write whatever happened')
  assert.match(writeBackSkipReason(true, { skip: 'search page state needs_login' }, none)!, /needs_login/)
  for (const status of [401, 403, 429, 500, 503]) assert.match(writeBackSkipReason(true, { status }, none)!, new RegExp(String(status)))
  for (const status of [0, 200, 301, 404]) assert.equal(writeBackSkipReason(true, { status }, one), undefined, 'status ' + status)
  assert.match(writeBackSkipReason(true, { loginSignal: true }, one)!, /login/)
  assert.equal(writeBackSkipReason(true, { loginSignal: true }, none), undefined, 'a login page that cost no cookie is harmless')
  assert.match(writeBackSkipReason(true, {}, all)!, /all its cookies/)
})

test('mergeIntoFile: writes the merge, keeps one .bak generation, writes nothing when nothing changed, 0600 files in a 0700 directory', () => {
  const dir = path.join(tmp(), 'auth')
  const file = path.join(dir, 'state.json')
  const baseline: StorageState = { cookies: [], origins: [] }
  const first = computeDelta(baseline, { cookies: [cookie('s', 'a.example.com', 'one')], origins: [] }, A)
  assert.equal(mergeIntoFile(file, first), 'written')
  assert.equal(fs.existsSync(file + '.bak'), false, 'there was no previous file to keep')
  assert.equal(fs.statSync(file).mode & 0o777, 0o600)
  assert.equal(fs.statSync(dir).mode & 0o777, 0o700)
  const mtime = fs.statSync(file).mtimeMs
  assert.equal(mergeIntoFile(file, first), 'unchanged')
  assert.equal(fs.statSync(file).mtimeMs, mtime)
  const second = computeDelta({ cookies: [cookie('s', 'a.example.com', 'one')], origins: [] }, { cookies: [cookie('s', 'a.example.com', 'two')], origins: [] }, A)
  assert.equal(mergeIntoFile(file, second), 'written')
  assert.equal(JSON.parse(fs.readFileSync(file + '.bak', 'utf8')).cookies[0].value, 'one')
  assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).cookies[0].value, 'two')
  assert.equal(fs.statSync(file + '.bak').mode & 0o777, 0o600)
  const third = computeDelta({ cookies: [cookie('s', 'a.example.com', 'two')], origins: [] }, { cookies: [cookie('s', 'a.example.com', 'three')], origins: [] }, A)
  mergeIntoFile(file, third)
  assert.equal(JSON.parse(fs.readFileSync(file + '.bak', 'utf8')).cookies[0].value, 'two', 'one generation only')
  assert.deepEqual(fs.readdirSync(dir).sort(), ['state.json', 'state.json.bak'], 'no temporary files are left')
})

test('mergeIntoFile does not create a file for a delta that holds nothing, and a file without arrays is not rewritten for nothing', () => {
  const dir = tmp()
  const file = path.join(dir, 'new.json')
  assert.equal(mergeIntoFile(file, { cookieUpserts: [], cookieDeletes: [], origins: [], baselineCookies: 0 }), 'unchanged')
  assert.equal(fs.existsSync(file), false)
  const bare = path.join(dir, 'bare.json')
  fs.writeFileSync(bare, '{"cookies":[]}')
  assert.equal(mergeIntoFile(bare, { cookieUpserts: [], cookieDeletes: [], origins: [], baselineCookies: 0 }), 'unchanged')
  assert.equal(fs.readFileSync(bare, 'utf8'), '{"cookies":[]}')
})

test('a corrupt or foreign current file is never overwritten', () => {
  const dir = tmp()
  const file = path.join(dir, 'state.json')
  const delta = computeDelta({ cookies: [], origins: [] }, { cookies: [cookie('s', 'a.example.com')], origins: [] }, A)
  fs.writeFileSync(file, '{"cookies": [')
  assert.throws(() => mergeIntoFile(file, delta), /left untouched/)
  assert.equal(fs.readFileSync(file, 'utf8'), '{"cookies": [')
  fs.writeFileSync(file, '[1,2]')
  assert.throws(() => mergeIntoFile(file, delta), /left untouched/)
  assert.equal(fs.readFileSync(file, 'utf8'), '[1,2]')
  assert.equal(fs.existsSync(file + '.bak'), false)
})

test('two profiles sharing one file, and two sites in one file, do not lose each other (merge into the CURRENT content)', () => {
  const dir = tmp()
  const file = path.join(dir, 'shared.json')
  fs.writeFileSync(file, JSON.stringify({ cookies: [cookie('sa', 'a.example.com', '1'), cookie('sb', 'b.example.com', '1')], origins: [{ origin: 'https://b.example.com', localStorage: [{ name: 'k', value: 'b' }] }] }))
  const baselineA = scopeState(JSON.parse(fs.readFileSync(file, 'utf8')), ['a.example.com'])
  const baselineB = scopeState(JSON.parse(fs.readFileSync(file, 'utf8')), ['b.example.com'])
  assert.equal(mergeIntoFile(file, computeDelta(baselineA, { cookies: [cookie('sa', 'a.example.com', '2')], origins: [] }, ['a.example.com'])), 'written')
  assert.equal(mergeIntoFile(file, computeDelta(baselineB, { cookies: [cookie('sb', 'b.example.com', '2')], origins: [{ origin: 'https://b.example.com', localStorage: [{ name: 'k', value: 'b2' }] }] }, ['b.example.com'])), 'written')
  const state = JSON.parse(fs.readFileSync(file, 'utf8')) as StorageState
  assert.deepEqual(state.cookies!.map(entry => entry.name + '=' + entry.value).sort(), ['sa=2', 'sb=2'])
  assert.equal(state.origins![0]!.localStorage![0]!.value, 'b2')
})

test('captureStorageState asks for IndexedDB, and falls back to the plain state when that throws or is over the limit', async () => {
  const calls: unknown[] = []
  const good = { storageState: async (options?: unknown) => { calls.push(options); return { cookies: [], origins: [{ origin: 'https://a.example.com', indexedDB: [] }] } } }
  assert.equal((await captureStorageState(good as any)).origins![0]!.indexedDB !== undefined, true)
  assert.deepEqual(calls, [{ indexedDB: true }])
  const throwing = { storageState: async (options?: { indexedDB?: boolean }) => { if (options?.indexedDB) throw new Error('indexedDB is not supported'); return { cookies: [cookie('s', 'a.example.com')], origins: [] } } }
  assert.equal((await captureStorageState(throwing as any)).cookies!.length, 1)
  const big = { storageState: async (options?: { indexedDB?: boolean }) => options?.indexedDB ? { cookies: [], origins: [{ origin: 'https://a.example.com', indexedDB: ['x'.repeat(5 * 1024 * 1024 + 10)] }] } : { cookies: [], origins: [{ origin: 'https://a.example.com', localStorage: [] }] } }
  assert.equal((await captureStorageState(big as any)).origins![0]!.indexedDB, undefined)
  const closed = { storageState: async () => { throw new Error('browser has been closed') } }
  await assert.rejects(() => captureStorageState(closed as any), /browser has been closed/)
})

test('the mutex is FIFO per key, keys do not block each other, and a release is idempotent', async () => {
  const mutex = new KeyedMutex()
  const order: string[] = []
  const first = await mutex.acquire('k')
  const second = mutex.acquire('k').then(release => { order.push('second'); return release })
  const third = mutex.acquire('k').then(release => { order.push('third'); return release })
  const other = await mutex.acquire('other')
  order.push('other')
  other()
  assert.deepEqual(order, ['other'])
  first(); first()
  ;(await second)()
  ;(await third)()
  assert.deepEqual(order, ['other', 'second', 'third'])
  assert.equal(mutex.size(), 0, 'nothing is left behind')
})

test('waiting for the mutex honours the AbortSignal and gives up with a clear error after the limit; neither leaves the queue blocked', async () => {
  const mutex = new KeyedMutex()
  const held = await mutex.acquire('k')
  const controller = new AbortController()
  const aborted = mutex.acquire('k', { signal: controller.signal })
  controller.abort()
  await assert.rejects(aborted, /aborted/)
  await assert.rejects(mutex.acquire('k', { timeoutMs: 30, label: 'login state of auth profile p' }), (error: Error) => error instanceof StateLockError && /login state of auth profile p is in use by another operation/.test(error.message))
  await assert.rejects(mutex.acquire('k', { signal: AbortSignal.abort() }), /aborted/)
  held()
  const next = await mutex.acquire('k', { timeoutMs: 30 })
  next()
  assert.equal(mutex.size(), 0)
})

test('the state file key is the real path: a symlink and a relative spelling share one lock, and a missing file keys on its directory', () => {
  const dir = fs.realpathSync(tmp())
  const file = path.join(dir, 'state.json')
  fs.writeFileSync(file, '{}')
  const link = path.join(dir, 'link.json')
  fs.symlinkSync(file, link)
  assert.equal(stateFileKey(link), stateFileKey(file))
  assert.equal(stateFileKey(path.join(dir, 'sub', '..', 'state.json')), stateFileKey(file))
  assert.equal(stateFileKey(path.join(dir, 'later.json')), path.join(dir, 'later.json'))
})
