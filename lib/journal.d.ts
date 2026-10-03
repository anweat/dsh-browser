/**
 * The exploration journal: a bounded, in-memory record of what one session did through `browser_call`.
 *
 * It is evidence for turning an exploration into a draft (`automation.develop` draft_from_journal), not a
 * log of the page. Entries hold the action, the page generation before and after, the locator, scrubbed
 * parameters, and the outcome. Typed text never appears in an entry: fill/type text is a reference
 * `{ref:'v<seq>', length, sensitive?}`. The text itself is kept in memory only when it is short (at most
 * {@link RAW_TEXT_MAX} characters) and does not look secret (see {@link looksSecret}), and only so a draft
 * can use it as a literal or an example; it is released together with its entry, and nothing is written to disk.
 * @module dsh-browser/journal
 */
import type { BrowserLocatorSpec } from './locator.ts';
import type { ErrorCode, ExecutionStatus } from './actions/types.ts';
/** Default number of entries a session keeps; the oldest are dropped first. */
export declare const JOURNAL_LIMIT = 200;
/** Typed text longer than this is never retained, only its length. */
export declare const RAW_TEXT_MAX = 200;
/** A scrubbed stand-in for a value that is not stored in the entry. */
export interface ValueRef {
    ref: string;
    length: number;
    sensitive?: true;
}
export type JournalEffects = 'none' | 'observed' | 'unknown';
export interface JournalEntry {
    seq: number;
    /** `group.action`, e.g. `act.fill`. */
    action: string;
    /** The page the call ran on (`t1`...). */
    targetId?: string;
    generationBefore?: number;
    generationAfter?: number;
    /** The element the call acted on, as a LocatorSpec (a CSS `selector` argument becomes `{css}`). */
    locator?: BrowserLocatorSpec;
    /** The call's arguments with values scrubbed; see the module comment. */
    params: Record<string, unknown>;
    outcome: {
        ok: boolean;
        executionStatus: ExecutionStatus;
        errorCode?: ErrorCode;
    };
    /** Whether the call changed anything: `none`, `observed` (it ran and changed state), `unknown` (it may have). */
    effects: JournalEffects;
    /** One short line about the result: page title/path or the error. */
    summary: string;
    /** A read-only observation: it never becomes a step. */
    observation?: true;
    /** The page URL after the call, secret query values redacted. */
    url?: string;
    /** For observations: characters of text read. */
    size?: number;
}
/** Field names that suggest a secret; the same list `observe.read` uses for controls. */
export declare const SENSITIVE_NAME: RegExp;
export declare function cardLike(value: string): boolean;
export declare function tokenLike(value: string): boolean;
/** A value that looks like a token, a JWT or a card number. */
export declare function looksSecret(value: string): boolean;
/** A locator that names a password-like field (its label, name, css...). */
export declare function locatorSuggestsSecret(locator: BrowserLocatorSpec | undefined): boolean;
/** `https://u:p@host/path?token=x` -> secret query values and userinfo removed. Returns the cleaned URL and whether anything was removed. */
export declare function redactUrl(value: string): {
    url: string;
    redacted: boolean;
};
export interface ScrubbedCall {
    params: Record<string, unknown>;
    locator?: BrowserLocatorSpec;
    /** The typed text, only when it may be retained. */
    raw?: string;
}
/**
 * Scrub the arguments of one call. `sensitiveControl` is true when the page itself says the target is a
 * password-like control (type=password, autocomplete one-time-code, ...).
 */
export declare function scrubCall(action: string, args: Record<string, unknown>, seq: number, sensitiveControl?: boolean): ScrubbedCall;
/** Whether a call goes into the journal. Lists, inspection, searches and drafting are not exploration. */
export declare function isJournaled(action: string): boolean;
export declare function isObservation(action: string): boolean;
/** What a finished call changed, from what it is and how it ended. */
export declare function effectsOf(mutating: boolean, outcome: JournalEntry['outcome']): JournalEffects;
export declare class SessionJournal {
    readonly limit: number;
    private nextSeq;
    private items;
    private readonly raws;
    /** How many entries fell off the front because of the limit. */
    dropped: number;
    constructor(limit?: number);
    /** Reserve the sequence number of a call that is about to run. */
    allocate(): number;
    add(entry: JournalEntry, raw?: string): void;
    entries(): readonly JournalEntry[];
    /** The retained typed text of an entry, if it was short and not secret. Internal: never part of an entry. */
    rawText(seq: number): string | undefined;
    get firstSeq(): number | undefined;
    get lastSeq(): number | undefined;
    get size(): number;
    clear(): void;
}
/** The one-line summary of a finished call, with no secret query values. */
export declare function summarize(action: string, envelope: {
    ok: boolean;
    result?: Record<string, unknown>;
    error?: {
        code: string;
        message: string;
    };
}): string;
