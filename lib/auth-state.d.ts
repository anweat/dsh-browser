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
export interface StorageCookie {
    name: string;
    value: string;
    domain: string;
    path: string;
    partitionKey?: unknown;
    [key: string]: unknown;
}
export interface StorageOrigin {
    origin: string;
    localStorage?: {
        name: string;
        value: string;
    }[];
    indexedDB?: unknown[];
    [key: string]: unknown;
}
export interface StorageState {
    cookies?: StorageCookie[];
    origins?: StorageOrigin[];
    [key: string]: unknown;
}
/** Above this the IndexedDB part of a captured state is dropped (the file's own IndexedDB is kept for those origins). */
export declare const INDEXEDDB_LIMIT_BYTES: number;
/** How long a transient operation waits for another one on the same state file before it gives up. */
export declare const STATE_LOCK_TIMEOUT_MS = 60000;
/** Cookie identity: name + domain + path + partition key. The domain is case-insensitive, its leading dot is not (host-only vs domain cookie). */
export declare function cookieKey(cookie: StorageCookie): string;
/** The part of a state a profile may see: its allowed domains only. */
export declare function scopeState(state: StorageState | undefined, domains: readonly string[]): {
    cookies: StorageCookie[];
    origins: StorageOrigin[];
};
export interface OriginDelta {
    origin: string;
    setLocal: {
        name: string;
        value: string;
    }[];
    deleteLocal: string[];
    /** Present only when the context captured IndexedDB for this origin and it differs from the baseline: replaces the file's. */
    indexedDB?: unknown[];
}
export interface StateDelta {
    cookieUpserts: StorageCookie[];
    /** Keys ({@link cookieKey}) of baseline cookies the context no longer has. */
    cookieDeletes: string[];
    origins: OriginDelta[];
    /** How many allowed-domain cookies the baseline held. */
    baselineCookies: number;
}
/**
 * What a context changed against the state it was given. Both sides are cut to the allowed domains first, so a cookie
 * of another domain that the context picked up is never part of the delta. An origin the context's state lacks is not
 * a deletion of that origin (Playwright leaves out origins whose storage it did not read).
 */
export declare function computeDelta(baseline: StorageState | undefined, current: StorageState | undefined, domains: readonly string[]): StateDelta;
/** True when the delta removes every allowed-domain cookie the baseline had (a non-empty baseline). */
export declare function deletesAllCookies(delta: StateDelta): boolean;
/** Apply a delta to the file's current content. Everything the delta does not name, in any domain, is carried over as is. */
export declare function applyDelta(file: StorageState | undefined, delta: StateDelta): StorageState;
/** What the operation that is closing tells the write-back. */
export interface WriteBackHint {
    /** The operation's own verdict says the page was not a normal answer (login wall, captcha, block, rate limit, error): do not write. */
    skip?: string;
    /** Main document HTTP status, when the operation has one. */
    status?: number;
    /** A login or captcha signal was seen on the page. */
    loginSignal?: boolean;
}
/**
 * Whether a closing context may be written back. Interactive sessions write whatever happened (the user may log out on
 * purpose). A transient operation does not write a state that looks like a bad answer: its own verdict, an error status,
 * a login/captcha page that took a cookie away, or any delta that would delete every cookie the baseline had.
 */
export declare function writeBackSkipReason(transient: boolean, hint: WriteBackHint, delta: StateDelta): string | undefined;
export type WriteBackOutcome = {
    outcome: 'written' | 'unchanged';
    at: number;
} | {
    outcome: 'skipped' | 'failed';
    reason: string;
    at: number;
};
/** Key of a state file: its real path (the directory's, when the file does not exist yet), so two spellings of one file share a lock. */
export declare function stateFileKey(file: string): string;
export declare class StateLockError extends Error {
    constructor(message: string);
}
/** A FIFO mutex per key. `acquire` waits for its turn, honours an AbortSignal and gives up after `timeoutMs`. */
export declare class KeyedMutex {
    private readonly queues;
    acquire(key: string, opts?: {
        signal?: AbortSignal;
        timeoutMs?: number;
        label?: string;
    }): Promise<() => void>;
    /** Number of keys that are held or awaited (tests). */
    size(): number;
}
/**
 * The state of a closing context, with IndexedDB. If capturing it throws, or the JSON is over {@link INDEXEDDB_LIMIT_BYTES},
 * the state is captured again without IndexedDB (the file's own IndexedDB then stays as it is: see {@link computeDelta}).
 */
export declare function captureStorageState(context: {
    storageState: (options?: {
        indexedDB?: boolean;
    }) => Promise<StorageState>;
}): Promise<StorageState>;
/**
 * Merge a delta into the file as it is NOW (a profile whose file does not exist yet gets it, even empty: that is how a
 * `persistState` profile is bootstrapped) and write it, keeping the previous content as `<file>.bak` (one generation).
 * Nothing is written when the merge changes nothing. A current file that cannot be parsed is never overwritten.
 */
export declare function mergeIntoFile(file: string, delta: StateDelta): 'written' | 'unchanged';
