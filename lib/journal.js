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
/** Default number of entries a session keeps; the oldest are dropped first. */
export const JOURNAL_LIMIT = 200;
/** Typed text longer than this is never retained, only its length. */
export const RAW_TEXT_MAX = 200;
// --- what counts as secret -----------------------------------------------------
/** Field names that suggest a secret; the same list `observe.read` uses for controls. */
export const SENSITIVE_NAME = /(^|[^a-z])(pass(word|wd|phrase|code)?|pwd|secret|token|api[-_ ]?key|credential|bearer|jwt|otp|csrf|xsrf|session[-_ ]?(id|key)?|ssn|cvv|cvc|private[-_ ]?key|authori[sz]ation|auth[-_ ]?(token|key|code)|one[-_ ]?time[-_ ]?code|card[-_ ]?(number|num|no)|cc[-_ ]?(number|num|csc|exp)|iban|account[-_ ]?(number|num))([^a-z]|$)/i;
function camel(value) { return value.replace(/([a-z])([A-Z])/g, '$1 $2'); }
export function cardLike(value) {
    const digits = value.replace(/[ -]/g, '');
    if (!/^\d{13,19}$/.test(digits))
        return false;
    let sum = 0;
    for (let i = 0; i < digits.length; i++) {
        let digit = Number(digits[digits.length - 1 - i]);
        if (i % 2 === 1) {
            digit *= 2;
            if (digit > 9)
                digit -= 9;
        }
        sum += digit;
    }
    return sum % 10 === 0;
}
export function tokenLike(value) {
    if (cardLike(value))
        return true;
    if (value.length < 20 || /\s/.test(value))
        return false;
    if (/^eyJ[\w-]+\.[\w-]+\.[\w-]*$/.test(value))
        return true;
    return /^[A-Za-z0-9_\-+/=.~]+$/.test(value) && /\d/.test(value) && /[A-Za-z]/.test(value);
}
/** A value that looks like a token, a JWT or a card number. */
export function looksSecret(value) {
    return tokenLike(value);
}
/** A locator that names a password-like field (its label, name, css...). */
export function locatorSuggestsSecret(locator) {
    if (!locator)
        return false;
    const parts = [locator.name, locator.label, locator.text, locator.testId, locator.selector, locator.css].filter((part) => typeof part === 'string');
    return parts.some(part => SENSITIVE_NAME.test(camel(part)));
}
/** `https://u:p@host/path?token=x` -> secret query values and userinfo removed. Returns the cleaned URL and whether anything was removed. */
export function redactUrl(value) {
    try {
        const parsed = new URL(value);
        let redacted = false;
        if (parsed.username || parsed.password) {
            parsed.username = '';
            parsed.password = '';
            redacted = true;
        }
        for (const key of [...parsed.searchParams.keys()]) {
            const raw = parsed.searchParams.get(key) ?? '';
            if (SENSITIVE_NAME.test(camel(key)) || /token|key|auth|session|cookie|password|secret/i.test(key) || tokenLike(raw)) {
                parsed.searchParams.set(key, '[redacted]');
                redacted = true;
            }
        }
        return { url: parsed.toString().slice(0, 2_000), redacted };
    }
    catch {
        return { url: value.slice(0, 200), redacted: false };
    }
}
// --- scrubbing a call's arguments ---------------------------------------------
/** Arguments that steer a call but carry no value worth keeping. */
const SKIP = new Set(['locator', 'selector', 'expectGeneration']);
/** Text typed into a control: always a reference. */
const TYPED = new Set(['act.fill', 'act.type']);
function clip(value, max = 200) { return value.length > max ? value.slice(0, max) + '…' : value; }
function normalizeLocator(args) {
    const given = args.locator;
    if (typeof args.selector === 'string' && given === undefined)
        return { css: clip(args.selector, 500) };
    if (!given || typeof given !== 'object' || Array.isArray(given))
        return undefined;
    const copy = {};
    for (const [key, value] of Object.entries(given)) {
        if (typeof value === 'string')
            copy[key === 'selector' ? 'css' : key] = clip(value, 500);
        else
            copy[key] = value;
    }
    return copy;
}
/** A short plain value kept as is; anything long or secret-looking becomes a reference. */
function scrubValue(value, seq, index = 0) {
    if (typeof value !== 'string')
        return value;
    if (value.length > RAW_TEXT_MAX || looksSecret(value))
        return { ref: `v${seq}${index ? '.' + index : ''}`, length: value.length, ...looksSecret(value) ? { sensitive: true } : {} };
    return value;
}
/**
 * Scrub the arguments of one call. `sensitiveControl` is true when the page itself says the target is a
 * password-like control (type=password, autocomplete one-time-code, ...).
 */
export function scrubCall(action, args, seq, sensitiveControl = false) {
    const locator = normalizeLocator(args);
    const params = {};
    let raw;
    for (const [key, value] of Object.entries(args)) {
        if (SKIP.has(key) || value === undefined)
            continue;
        if (typeof value === 'string') {
            if (TYPED.has(action) && key === 'text') {
                const sensitive = sensitiveControl || locatorSuggestsSecret(locator) || looksSecret(value);
                params[key] = { ref: `v${seq}`, length: value.length, ...sensitive ? { sensitive: true } : {} };
                if (!sensitive && value.length <= RAW_TEXT_MAX)
                    raw = value;
            }
            else if (key === 'url')
                params[key] = redactUrl(value).url;
            else if (['expression', 'source', 'code', 'script'].includes(key))
                params[key] = { ref: `v${seq}`, length: value.length };
            else
                params[key] = scrubValue(value, seq);
        }
        else if (Array.isArray(value)) {
            if (key === 'files')
                params.files = { count: value.length, names: value.slice(0, 5).map(file => clip(String(file).split(/[\\/]/).pop() ?? '', 80)) };
            else if (['steps', 'recipe'].includes(key))
                params[key] = { count: value.length };
            else
                params[key] = value.slice(0, 20).map((entry, index) => scrubValue(entry, seq, index + 1));
        }
        else if (value && typeof value === 'object') {
            // inputs and the like: only the names, never the values.
            params[key] = { keys: Object.keys(value).slice(0, 10) };
        }
        else
            params[key] = value;
    }
    return { params, ...locator ? { locator } : {}, ...raw !== undefined ? { raw } : {} };
}
// --- which calls are journaled -------------------------------------------------
const JOURNALED_GROUPS = new Set(['target', 'observe', 'act', 'script']);
const JOURNALED_EXTRA = new Set(['automation.run_recipe', 'automation.run']);
/** Calls that only read the page: observation points, never steps. */
const OBSERVATIONS = new Set(['observe.read', 'observe.screenshot']);
/** Whether a call goes into the journal. Lists, inspection, searches and drafting are not exploration. */
export function isJournaled(action) {
    if (action === 'target.list')
        return false;
    return JOURNALED_GROUPS.has(action.split('.')[0]) || JOURNALED_EXTRA.has(action);
}
export function isObservation(action) {
    return OBSERVATIONS.has(action);
}
/** What a finished call changed, from what it is and how it ended. */
export function effectsOf(mutating, outcome) {
    if (!mutating)
        return 'none';
    if (outcome.ok)
        return 'observed';
    if (outcome.executionStatus === 'outcome_unknown')
        return 'unknown';
    const never = ['LOCATOR_NOT_FOUND', 'LOCATOR_AMBIGUOUS', 'NOT_ACTIONABLE', 'TARGET_STALE', 'INVALID_ARGS', 'TARGET_CLOSED', 'POLICY_DENIED', 'INVALID_RECIPE'];
    return outcome.errorCode && never.includes(outcome.errorCode) ? 'none' : 'unknown';
}
// --- the journal itself --------------------------------------------------------
export class SessionJournal {
    limit;
    nextSeq = 1;
    items = [];
    raws = new Map();
    /** How many entries fell off the front because of the limit. */
    dropped = 0;
    constructor(limit = JOURNAL_LIMIT) {
        this.limit = limit;
    }
    /** Reserve the sequence number of a call that is about to run. */
    allocate() {
        return this.nextSeq++;
    }
    add(entry, raw) {
        this.items.push(entry);
        if (this.items.length > 1 && this.items[this.items.length - 2].seq > entry.seq)
            this.items.sort((a, b) => a.seq - b.seq);
        if (raw !== undefined)
            this.raws.set(entry.seq, raw);
        while (this.items.length > this.limit) {
            const gone = this.items.shift();
            this.raws.delete(gone.seq);
            this.dropped += 1;
        }
    }
    entries() {
        return this.items;
    }
    /** The retained typed text of an entry, if it was short and not secret. Internal: never part of an entry. */
    rawText(seq) {
        return this.raws.get(seq);
    }
    get firstSeq() { return this.items[0]?.seq; }
    get lastSeq() { return this.items[this.items.length - 1]?.seq; }
    get size() { return this.items.length; }
    clear() {
        this.items = [];
        this.raws.clear();
    }
}
/** The one-line summary of a finished call, with no secret query values. */
export function summarize(action, envelope) {
    if (!envelope.ok)
        return clip(`${envelope.error?.code ?? 'FAILED'}: ${String(envelope.error?.message ?? '').split('\n')[0]}`, 140);
    const result = envelope.result ?? {};
    const parts = [];
    if (typeof result.title === 'string' && result.title)
        parts.push(clip(result.title, 60));
    if (typeof result.url === 'string' && result.url) {
        try {
            const parsed = new URL(redactUrl(result.url).url);
            parts.push(parsed.pathname + parsed.search);
        }
        catch {
            parts.push(clip(result.url, 80));
        }
    }
    if (typeof result.text === 'string' && isObservation(action))
        parts.push(`${result.text.length} chars`);
    return clip(parts.join(' | ') || 'ok', 140);
}
//# sourceMappingURL=journal.js.map