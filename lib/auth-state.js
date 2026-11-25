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
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { hostAllowed } from "./auth-profiles.js";
/** Above this the IndexedDB part of a captured state is dropped (the file's own IndexedDB is kept for those origins). */
export const INDEXEDDB_LIMIT_BYTES = 5 * 1024 * 1024;
/** How long a transient operation waits for another one on the same state file before it gives up. */
export const STATE_LOCK_TIMEOUT_MS = 60_000;
/** Cookie identity: name + domain + path + partition key. The domain is case-insensitive, its leading dot is not (host-only vs domain cookie). */
export function cookieKey(cookie) {
    const partition = cookie.partitionKey === undefined || cookie.partitionKey === null || cookie.partitionKey === '' ? '' : JSON.stringify(cookie.partitionKey);
    return [cookie.name, String(cookie.domain ?? '').toLowerCase(), cookie.path ?? '/', partition].join('\u0000');
}
function cookieAllowed(cookie, domains) {
    return typeof cookie?.domain === 'string' && typeof cookie.name === 'string' && hostAllowed(cookie.domain.replace(/^\./, ''), domains);
}
function originAllowed(origin, domains) {
    try {
        return hostAllowed(new URL(origin.origin).hostname, domains);
    }
    catch {
        return false;
    }
}
/** The part of a state a profile may see: its allowed domains only. */
export function scopeState(state, domains) {
    return {
        cookies: (Array.isArray(state?.cookies) ? state.cookies : []).filter(cookie => cookieAllowed(cookie, domains)),
        origins: (Array.isArray(state?.origins) ? state.origins : []).filter(origin => typeof origin?.origin === 'string' && originAllowed(origin, domains)),
    };
}
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
/**
 * What a context changed against the state it was given. Both sides are cut to the allowed domains first, so a cookie
 * of another domain that the context picked up is never part of the delta. An origin the context's state lacks is not
 * a deletion of that origin (Playwright leaves out origins whose storage it did not read).
 */
export function computeDelta(baseline, current, domains) {
    const before = scopeState(baseline, domains);
    const now = scopeState(current, domains);
    const beforeCookies = new Map(before.cookies.map(cookie => [cookieKey(cookie), cookie]));
    const nowKeys = new Set();
    const cookieUpserts = [];
    for (const cookie of now.cookies) {
        const key = cookieKey(cookie);
        nowKeys.add(key);
        const old = beforeCookies.get(key);
        if (!old || !same(old, cookie))
            cookieUpserts.push(cookie);
    }
    const cookieDeletes = [...beforeCookies.keys()].filter(key => !nowKeys.has(key));
    const beforeOrigins = new Map(before.origins.map(origin => [origin.origin, origin]));
    const origins = [];
    for (const origin of now.origins) {
        const old = beforeOrigins.get(origin.origin);
        const oldLocal = new Map((old?.localStorage ?? []).map(entry => [entry.name, entry.value]));
        const nowLocal = new Map((origin.localStorage ?? []).map(entry => [entry.name, entry.value]));
        const setLocal = [...nowLocal].filter(([name, value]) => oldLocal.get(name) !== value || !oldLocal.has(name)).map(([name, value]) => ({ name, value }));
        const deleteLocal = [...oldLocal.keys()].filter(name => !nowLocal.has(name));
        const indexedDB = Array.isArray(origin.indexedDB) && !same(origin.indexedDB, old?.indexedDB) ? origin.indexedDB : undefined;
        if (setLocal.length || deleteLocal.length || indexedDB)
            origins.push({ origin: origin.origin, setLocal, deleteLocal, ...indexedDB ? { indexedDB } : {} });
    }
    return { cookieUpserts, cookieDeletes, origins, baselineCookies: before.cookies.length };
}
/** True when the delta removes every allowed-domain cookie the baseline had (a non-empty baseline). */
export function deletesAllCookies(delta) {
    return delta.baselineCookies > 0 && delta.cookieDeletes.length >= delta.baselineCookies;
}
/** Apply a delta to the file's current content. Everything the delta does not name, in any domain, is carried over as is. */
export function applyDelta(file, delta) {
    const out = { ...file ?? {}, cookies: [...Array.isArray(file?.cookies) ? file.cookies : []], origins: (Array.isArray(file?.origins) ? file.origins : []).map(origin => ({ ...origin })) };
    const remove = new Set(delta.cookieDeletes);
    if (remove.size)
        out.cookies = out.cookies.filter(cookie => !remove.has(cookieKey(cookie)));
    for (const cookie of delta.cookieUpserts) {
        const key = cookieKey(cookie);
        const index = out.cookies.findIndex(existing => cookieKey(existing) === key);
        if (index >= 0)
            out.cookies[index] = cookie;
        else
            out.cookies.push(cookie);
    }
    for (const change of delta.origins) {
        let target = out.origins.find(origin => origin.origin === change.origin);
        if (!target) {
            target = { origin: change.origin, localStorage: [] };
            out.origins.push(target);
        }
        if (change.setLocal.length || change.deleteLocal.length) {
            const entries = new Map((target.localStorage ?? []).map(entry => [entry.name, entry]));
            for (const name of change.deleteLocal)
                entries.delete(name);
            for (const entry of change.setLocal)
                entries.set(entry.name, { name: entry.name, value: entry.value });
            target.localStorage = [...entries.values()];
        }
        if (change.indexedDB)
            target.indexedDB = change.indexedDB;
    }
    return out;
}
/**
 * Whether a closing context may be written back. Interactive sessions write whatever happened (the user may log out on
 * purpose). A transient operation does not write a state that looks like a bad answer: its own verdict, an error status,
 * a login/captcha page that took a cookie away, or any delta that would delete every cookie the baseline had.
 */
export function writeBackSkipReason(transient, hint, delta) {
    if (!transient)
        return undefined;
    if (hint.skip)
        return hint.skip;
    const status = hint.status ?? 0;
    if (status === 401 || status === 403 || status === 429 || status >= 500)
        return 'main document status ' + status;
    if (hint.loginSignal && delta.cookieDeletes.length > 0)
        return 'login or captcha page and the state lost cookies';
    if (deletesAllCookies(delta))
        return 'the state would lose all its cookies';
    return undefined;
}
// ── locks ───────────────────────────────────────────────────────────────────
/**
 * Key of a state file: its canonical real path (the directory's, when the file does not exist yet), so two spellings of one
 * file share a lock. `realpathSync.native` is used because the JS `realpathSync` keeps the spelling it was given on Windows
 * (case, 8.3 short names) and on case-insensitive macOS volumes. On Windows the key is also case-folded (the file system is
 * case-insensitive, and a file that does not exist yet has only its given spelling); elsewhere it is not (a volume may be
 * case-sensitive).
 */
export function stateFileKey(file, platform = process.platform) {
    const fold = (key) => platform === 'win32' ? key.toLowerCase() : key;
    try {
        return fold(fs.realpathSync.native(file));
    }
    catch { /* not there yet */ }
    const resolved = path.resolve(file);
    try {
        return fold(path.join(fs.realpathSync.native(path.dirname(resolved)), path.basename(resolved)));
    }
    catch {
        return fold(resolved);
    }
}
export class StateLockError extends Error {
    constructor(message) { super(message); this.name = 'StateLockError'; }
}
/** A FIFO mutex per key. `acquire` waits for its turn, honours an AbortSignal and gives up after `timeoutMs`. */
export class KeyedMutex {
    queues = new Map();
    acquire(key, opts = {}) {
        if (opts.signal?.aborted)
            return Promise.reject(new Error('browser operation aborted while waiting for the login state'));
        let queue = this.queues.get(key);
        if (!queue) {
            queue = { held: false, waiters: [] };
            this.queues.set(key, queue);
        }
        const q = queue;
        const release = () => {
            let done = false;
            return () => {
                if (done)
                    return;
                done = true;
                const next = q.waiters.shift();
                if (next)
                    next();
                else {
                    q.held = false;
                    if (this.queues.get(key) === q)
                        this.queues.delete(key);
                }
            };
        };
        if (!q.held) {
            q.held = true;
            return Promise.resolve(release());
        }
        return new Promise((resolve, reject) => {
            const timeoutMs = opts.timeoutMs ?? STATE_LOCK_TIMEOUT_MS;
            const wake = () => { clearTimeout(timer); opts.signal?.removeEventListener('abort', onAbort); resolve(release()); };
            const leave = () => { const index = q.waiters.indexOf(wake); if (index >= 0)
                q.waiters.splice(index, 1); clearTimeout(timer); opts.signal?.removeEventListener('abort', onAbort); };
            const timer = setTimeout(() => { leave(); reject(new StateLockError(`${opts.label ?? 'login state'} is in use by another operation for more than ${Math.round(timeoutMs / 1000)} s; try again when it has finished`)); }, timeoutMs);
            const onAbort = () => { leave(); reject(new Error('browser operation aborted while waiting for the login state')); };
            q.waiters.push(wake);
            opts.signal?.addEventListener('abort', onAbort, { once: true });
        });
    }
    /** Number of keys that are held or awaited (tests). */
    size() { return this.queues.size; }
}
/**
 * The state of a closing context, with IndexedDB. If capturing it throws, or the JSON is over {@link INDEXEDDB_LIMIT_BYTES},
 * the state is captured again without IndexedDB (the file's own IndexedDB then stays as it is: see {@link computeDelta}).
 */
export async function captureStorageState(context) {
    try {
        const withDb = await context.storageState({ indexedDB: true });
        if (Buffer.byteLength(JSON.stringify(withDb)) <= INDEXEDDB_LIMIT_BYTES)
            return withDb;
    }
    catch { /* retry without IndexedDB; a closed browser fails again below and is handled by the caller */ }
    return context.storageState();
}
// ── file ────────────────────────────────────────────────────────────────────
function readCurrent(file) {
    let text;
    try {
        text = fs.readFileSync(file, 'utf8');
    }
    catch (error) {
        if (error.code === 'ENOENT')
            return undefined;
        throw error;
    }
    if (!text.trim())
        return undefined;
    let parsed;
    try {
        parsed = JSON.parse(text);
    }
    catch {
        throw new Error('login state file is not valid JSON and was left untouched: refusing to overwrite it');
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
        throw new Error('login state file is not a storageState object and was left untouched: refusing to overwrite it');
    return parsed;
}
/** A state file could not be written. `message` says what the user can do and what was lost; it holds no path. */
export class StateWriteError extends Error {
    code;
    constructor(code, message, cause) { super(message, { cause }); this.name = 'StateWriteError'; this.code = code; }
}
/** On Windows a rename onto a file that any other process has open fails with these codes until it is closed. */
const RENAME_RETRY_CODES = new Set(['EPERM', 'EBUSY', 'EACCES']);
export const RENAME_RETRY_BUDGET_MS = 2000;
async function renameWithRetry(from, to, io) {
    const rename = io.rename ?? fs.renameSync;
    const sleep = io.sleep ?? ((ms) => new Promise(resolve => setTimeout(resolve, ms)));
    const retry = (io.platform ?? process.platform) === 'win32';
    const budget = io.budgetMs ?? RENAME_RETRY_BUDGET_MS;
    const started = Date.now();
    let delay = 10;
    for (;;) {
        try {
            await rename(from, to);
            return;
        }
        catch (error) {
            const code = String(error?.code ?? 'error');
            if (!retry || !RENAME_RETRY_CODES.has(code))
                throw error;
            const left = budget - (Date.now() - started);
            if (left <= 0)
                throw error;
            await sleep(Math.min(delay, left));
            delay = Math.min(delay * 2, 250);
        }
    }
}
async function atomicWrite(file, content, io) {
    const temporary = file + '.tmp-' + crypto.randomUUID().slice(0, 8);
    try {
        fs.writeFileSync(temporary, content, { encoding: 'utf8', mode: 0o600 });
        await renameWithRetry(temporary, file, io);
    }
    catch (error) {
        try {
            fs.rmSync(temporary, { force: true });
        }
        catch { /* best effort */ }
        const code = String(error?.code ?? 'error');
        throw new StateWriteError(code, RENAME_RETRY_CODES.has(code)
            ? `the login state file is open in another program (${code}), so the refreshed login was not saved; the previous file is unchanged. Close the program that has it open (antivirus, sync or indexing tools can too) and log in again if the login stops working`
            : `the login state file could not be written (${code}), so the refreshed login was not saved; the previous file is unchanged`, error);
    }
}
/**
 * Merge a delta into the file as it is NOW (a profile whose file does not exist yet gets it, even empty: that is how a
 * `persistState` profile is bootstrapped) and write it, keeping the previous content as `<file>.bak` (one generation).
 * Nothing is written when the merge changes nothing. A current file that cannot be parsed is never overwritten.
 * Async only because a rename that Windows refuses is retried for up to {@link RENAME_RETRY_BUDGET_MS}; the caller holds
 * the per-file lock for the whole time. Failure throws {@link StateWriteError}; no temporary file is left.
 */
export async function mergeIntoFile(file, delta, io = {}) {
    const current = readCurrent(file);
    const merged = applyDelta(current, delta);
    const exists = current !== undefined;
    if (exists && same(applyDelta(current, { cookieUpserts: [], cookieDeletes: [], origins: [], baselineCookies: 0 }), merged))
        return 'unchanged';
    fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
    if (exists)
        await atomicWrite(file + '.bak', fs.readFileSync(file, 'utf8'), io);
    await atomicWrite(file, JSON.stringify(merged, null, 2), io);
    return 'written';
}
//# sourceMappingURL=auth-state.js.map