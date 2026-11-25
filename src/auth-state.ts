/**
 * Safe write-back of a `persistState` auth profile's storageState file.
 *
 * The old write-back saved the whole (domain-filtered) state of a closing context over the file. That lost every
 * other site in a shared file, replaced a good login with the logged-out state a bad answer had left in the context,
 * and let two overlapping operations start from the same one-time token. This module is the pure part of the fix:
 * the delta of what a context changed against what it was given, the merge of that delta into the file's CURRENT
 * content, the rules that refuse a write-back, and the in-process locks. The service wires them around its contexts.
 * @module dsh-browser/auth-state
 */

import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { hostAllowed } from './auth-profiles.ts'

export interface StorageCookie { name: string; value: string; domain: string; path: string; partitionKey?: unknown; [key: string]: unknown }
export interface StorageOrigin { origin: string; localStorage?: { name: string; value: string }[]; indexedDB?: unknown[]; [key: string]: unknown }
export interface StorageState { cookies?: StorageCookie[]; origins?: StorageOrigin[]; [key: string]: unknown }

/** Above this the IndexedDB part of a captured state is dropped (the file's own IndexedDB is kept for those origins). */
export const INDEXEDDB_LIMIT_BYTES = 5 * 1024 * 1024
/** How long a transient operation waits for another one on the same state file before it gives up. */
export const STATE_LOCK_TIMEOUT_MS = 60_000

/** Cookie identity: name + domain + path + partition key. The domain is case-insensitive, its leading dot is not (host-only vs domain cookie). */
export function cookieKey(cookie: StorageCookie): string {
  const partition = cookie.partitionKey === undefined || cookie.partitionKey === null || cookie.partitionKey === '' ? '' : JSON.stringify(cookie.partitionKey)
  return [cookie.name, String(cookie.domain ?? '').toLowerCase(), cookie.path ?? '/', partition].join('\u0000')
}

function cookieAllowed(cookie: StorageCookie, domains: readonly string[]): boolean {
  return typeof cookie?.domain === 'string' && typeof cookie.name === 'string' && hostAllowed(cookie.domain.replace(/^\./, ''), domains)
}

function originAllowed(origin: StorageOrigin, domains: readonly string[]): boolean {
  try { return hostAllowed(new URL(origin.origin).hostname, domains) } catch { return false }
}

/** The part of a state a profile may see: its allowed domains only. */
export function scopeState(state: StorageState | undefined, domains: readonly string[]): { cookies: StorageCookie[]; origins: StorageOrigin[] } {
  return {
    cookies: (Array.isArray(state?.cookies) ? state.cookies : []).filter(cookie => cookieAllowed(cookie, domains)),
    origins: (Array.isArray(state?.origins) ? state.origins : []).filter(origin => typeof origin?.origin === 'string' && originAllowed(origin, domains)),
  }
}

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b)

export interface OriginDelta {
  origin: string
  setLocal: { name: string; value: string }[]
  deleteLocal: string[]
  /** Present only when the context captured IndexedDB for this origin and it differs from the baseline: replaces the file's. */
  indexedDB?: unknown[]
}

export interface StateDelta {
  cookieUpserts: StorageCookie[]
  /** Keys ({@link cookieKey}) of baseline cookies the context no longer has. */
  cookieDeletes: string[]
  origins: OriginDelta[]
  /** How many allowed-domain cookies the baseline held. */
  baselineCookies: number
}

/**
 * What a context changed against the state it was given. Both sides are cut to the allowed domains first, so a cookie
 * of another domain that the context picked up is never part of the delta. An origin the context's state lacks is not
 * a deletion of that origin (Playwright leaves out origins whose storage it did not read).
 */
export function computeDelta(baseline: StorageState | undefined, current: StorageState | undefined, domains: readonly string[]): StateDelta {
  const before = scopeState(baseline, domains)
  const now = scopeState(current, domains)
  const beforeCookies = new Map(before.cookies.map(cookie => [cookieKey(cookie), cookie]))
  const nowKeys = new Set<string>()
  const cookieUpserts: StorageCookie[] = []
  for (const cookie of now.cookies) {
    const key = cookieKey(cookie)
    nowKeys.add(key)
    const old = beforeCookies.get(key)
    if (!old || !same(old, cookie)) cookieUpserts.push(cookie)
  }
  const cookieDeletes = [...beforeCookies.keys()].filter(key => !nowKeys.has(key))
  const beforeOrigins = new Map(before.origins.map(origin => [origin.origin, origin]))
  const origins: OriginDelta[] = []
  for (const origin of now.origins) {
    const old = beforeOrigins.get(origin.origin)
    const oldLocal = new Map((old?.localStorage ?? []).map(entry => [entry.name, entry.value]))
    const nowLocal = new Map((origin.localStorage ?? []).map(entry => [entry.name, entry.value]))
    const setLocal = [...nowLocal].filter(([name, value]) => oldLocal.get(name) !== value || !oldLocal.has(name)).map(([name, value]) => ({ name, value }))
    const deleteLocal = [...oldLocal.keys()].filter(name => !nowLocal.has(name))
    const indexedDB = Array.isArray(origin.indexedDB) && !same(origin.indexedDB, old?.indexedDB) ? origin.indexedDB : undefined
    if (setLocal.length || deleteLocal.length || indexedDB) origins.push({ origin: origin.origin, setLocal, deleteLocal, ...indexedDB ? { indexedDB } : {} })
  }
  return { cookieUpserts, cookieDeletes, origins, baselineCookies: before.cookies.length }
}

/** True when the delta removes every allowed-domain cookie the baseline had (a non-empty baseline). */
export function deletesAllCookies(delta: StateDelta): boolean {
  return delta.baselineCookies > 0 && delta.cookieDeletes.length >= delta.baselineCookies
}

/** Apply a delta to the file's current content. Everything the delta does not name, in any domain, is carried over as is. */
export function applyDelta(file: StorageState | undefined, delta: StateDelta): StorageState {
  const out: StorageState = { ...file ?? {}, cookies: [...Array.isArray(file?.cookies) ? file.cookies : []], origins: (Array.isArray(file?.origins) ? file.origins : []).map(origin => ({ ...origin })) }
  const remove = new Set(delta.cookieDeletes)
  if (remove.size) out.cookies = out.cookies!.filter(cookie => !remove.has(cookieKey(cookie)))
  for (const cookie of delta.cookieUpserts) {
    const key = cookieKey(cookie)
    const index = out.cookies!.findIndex(existing => cookieKey(existing) === key)
    if (index >= 0) out.cookies![index] = cookie
    else out.cookies!.push(cookie)
  }
  for (const change of delta.origins) {
    let target = out.origins!.find(origin => origin.origin === change.origin)
    if (!target) { target = { origin: change.origin, localStorage: [] }; out.origins!.push(target) }
    if (change.setLocal.length || change.deleteLocal.length) {
      const entries = new Map((target.localStorage ?? []).map(entry => [entry.name, entry]))
      for (const name of change.deleteLocal) entries.delete(name)
      for (const entry of change.setLocal) entries.set(entry.name, { name: entry.name, value: entry.value })
      target.localStorage = [...entries.values()]
    }
    if (change.indexedDB) target.indexedDB = change.indexedDB
  }
  return out
}

/** What the operation that is closing tells the write-back. */
export interface WriteBackHint {
  /** The operation's own verdict says the page was not a normal answer (login wall, captcha, block, rate limit, error): do not write. */
  skip?: string
  /** Main document HTTP status, when the operation has one. */
  status?: number
  /** A login or captcha signal was seen on the page. */
  loginSignal?: boolean
}

/**
 * Whether a closing context may be written back. Interactive sessions write whatever happened (the user may log out on
 * purpose). A transient operation does not write a state that looks like a bad answer: its own verdict, an error status,
 * a login/captcha page that took a cookie away, or any delta that would delete every cookie the baseline had.
 */
export function writeBackSkipReason(transient: boolean, hint: WriteBackHint, delta: StateDelta): string | undefined {
  if (!transient) return undefined
  if (hint.skip) return hint.skip
  const status = hint.status ?? 0
  if (status === 401 || status === 403 || status === 429 || status >= 500) return 'main document status ' + status
  if (hint.loginSignal && delta.cookieDeletes.length > 0) return 'login or captcha page and the state lost cookies'
  if (deletesAllCookies(delta)) return 'the state would lose all its cookies'
  return undefined
}

export type WriteBackOutcome =
  | { outcome: 'written' | 'unchanged'; at: number }
  | { outcome: 'skipped' | 'failed'; reason: string; at: number }

// ── locks ───────────────────────────────────────────────────────────────────

/** Key of a state file: its real path (the directory's, when the file does not exist yet), so two spellings of one file share a lock. */
export function stateFileKey(file: string): string {
  try { return fs.realpathSync(file) } catch { /* not there yet */ }
  const resolved = path.resolve(file)
  try { return path.join(fs.realpathSync(path.dirname(resolved)), path.basename(resolved)) } catch { return resolved }
}

export class StateLockError extends Error {
  constructor(message: string) { super(message); this.name = 'StateLockError' }
}

/** A FIFO mutex per key. `acquire` waits for its turn, honours an AbortSignal and gives up after `timeoutMs`. */
export class KeyedMutex {
  private readonly queues = new Map<string, { held: boolean; waiters: (() => void)[] }>()

  acquire(key: string, opts: { signal?: AbortSignal; timeoutMs?: number; label?: string } = {}): Promise<() => void> {
    if (opts.signal?.aborted) return Promise.reject(new Error('browser operation aborted while waiting for the login state'))
    let queue = this.queues.get(key)
    if (!queue) { queue = { held: false, waiters: [] }; this.queues.set(key, queue) }
    const q = queue
    const release = (): (() => void) => {
      let done = false
      return () => {
        if (done) return
        done = true
        const next = q.waiters.shift()
        if (next) next()
        else { q.held = false; if (this.queues.get(key) === q) this.queues.delete(key) }
      }
    }
    if (!q.held) { q.held = true; return Promise.resolve(release()) }
    return new Promise((resolve, reject) => {
      const timeoutMs = opts.timeoutMs ?? STATE_LOCK_TIMEOUT_MS
      const wake = () => { clearTimeout(timer); opts.signal?.removeEventListener('abort', onAbort); resolve(release()) }
      const leave = () => { const index = q.waiters.indexOf(wake); if (index >= 0) q.waiters.splice(index, 1); clearTimeout(timer); opts.signal?.removeEventListener('abort', onAbort) }
      const timer = setTimeout(() => { leave(); reject(new StateLockError(`${opts.label ?? 'login state'} is in use by another operation for more than ${Math.round(timeoutMs / 1000)} s; try again when it has finished`)) }, timeoutMs)
      const onAbort = () => { leave(); reject(new Error('browser operation aborted while waiting for the login state')) }
      q.waiters.push(wake)
      opts.signal?.addEventListener('abort', onAbort, { once: true })
    })
  }

  /** Number of keys that are held or awaited (tests). */
  size(): number { return this.queues.size }
}

/**
 * The state of a closing context, with IndexedDB. If capturing it throws, or the JSON is over {@link INDEXEDDB_LIMIT_BYTES},
 * the state is captured again without IndexedDB (the file's own IndexedDB then stays as it is: see {@link computeDelta}).
 */
export async function captureStorageState(context: { storageState: (options?: { indexedDB?: boolean }) => Promise<StorageState> }): Promise<StorageState> {
  try {
    const withDb = await context.storageState({ indexedDB: true })
    if (Buffer.byteLength(JSON.stringify(withDb)) <= INDEXEDDB_LIMIT_BYTES) return withDb
  } catch { /* retry without IndexedDB; a closed browser fails again below and is handled by the caller */ }
  return context.storageState()
}

// ── file ────────────────────────────────────────────────────────────────────

function readCurrent(file: string): StorageState | undefined {
  let text: string
  try { text = fs.readFileSync(file, 'utf8') } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
    throw error
  }
  if (!text.trim()) return undefined
  let parsed: unknown
  try { parsed = JSON.parse(text) } catch { throw new Error('login state file is not valid JSON and was left untouched: refusing to overwrite it') }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('login state file is not a storageState object and was left untouched: refusing to overwrite it')
  return parsed as StorageState
}

function atomicWrite(file: string, content: string): void {
  const temporary = file + '.tmp-' + crypto.randomUUID().slice(0, 8)
  try {
    fs.writeFileSync(temporary, content, { encoding: 'utf8', mode: 0o600 })
    fs.renameSync(temporary, file)
  } catch (error) {
    try { fs.rmSync(temporary, { force: true }) } catch { /* best effort */ }
    throw error
  }
}

/**
 * Merge a delta into the file as it is NOW and write it, keeping the previous content as `<file>.bak` (one generation).
 * Nothing is written when the merge changes nothing. A current file that cannot be parsed is never overwritten.
 */
export function mergeIntoFile(file: string, delta: StateDelta): 'written' | 'unchanged' {
  const current = readCurrent(file)
  const merged = applyDelta(current, delta)
  const exists = current !== undefined
  if (exists && same(applyDelta(current, { cookieUpserts: [], cookieDeletes: [], origins: [], baselineCookies: 0 }), merged)) return 'unchanged'
  if (!exists && merged.cookies!.length === 0 && merged.origins!.length === 0) return 'unchanged'
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 })
  if (exists) atomicWrite(file + '.bak', fs.readFileSync(file, 'utf8'))
  atomicWrite(file, JSON.stringify(merged, null, 2))
  return 'written'
}
