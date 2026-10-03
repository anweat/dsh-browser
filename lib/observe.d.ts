/**
 * Structured page observation behind `observe.read` sections.
 *
 * The in-page scan (`observe-script.ts`) reads the DOM; this module turns its output into the
 * model-facing record:
 *
 * - every listed element gets a candidate LocatorSpec that was CHECKED against the live page: it matches
 *   that element and no other (`locator`), or, when no candidate is unique, the best one is returned with
 *   `ambiguous: true`, how many elements it matches, and the element's position among them (`nth`);
 * - the whole result is fitted to a byte budget by dropping whole items or text from the end, so the JSON
 *   is always valid and `truncation` says what was left out.
 *
 * A property that was not observed is absent: `false` always means "observed, and not so".
 * @module dsh-browser/observe
 */
import { type BrowserFrameSpec, type BrowserTarget } from './locator.ts';
export declare const OBSERVE_SECTIONS: readonly ["content", "controls", "links", "tables"];
export type ObserveSection = typeof OBSERVE_SECTIONS[number];
export declare const OBSERVE_DEFAULT_ITEMS = 50;
export declare const OBSERVE_MAX_ITEMS = 500;
export declare const OBSERVE_DEFAULT_BYTES = 24000;
export declare const OBSERVE_MIN_BYTES = 2000;
export declare const OBSERVE_MAX_BYTES = 90000;
export interface ObserveRegion {
    x: number;
    y: number;
    width: number;
    height: number;
}
/** The arguments of observe.read after validation. */
export interface ObserveRequest {
    sections: readonly ObserveSection[];
    target?: BrowserTarget;
    region?: ObserveRegion;
    maxItems: number;
    maxBytes: number;
    includeValues: boolean;
    timeoutMs: number;
}
export declare class ObserveArgError extends Error {
    constructor(message: string);
}
/** Check and complete the raw arguments (the registry validated their types already). */
export declare function normalizeObserve(raw: {
    sections?: readonly string[];
    target?: BrowserTarget;
    region?: ObserveRegion;
    maxItems?: number;
    maxBytes?: number;
    includeValues?: boolean;
    timeoutMs?: number;
}): ObserveRequest;
interface RawCandidate extends Record<string, unknown> {
}
interface RawOption {
    id?: number;
    value: string;
    label: string;
    selected?: boolean;
    checked?: boolean;
    disabled?: boolean;
    cands?: RawCandidate[];
}
interface RawControl {
    id?: number;
    source: 'dom' | 'aria';
    path: string[];
    role?: string;
    name?: string;
    type?: string;
    visible?: boolean;
    disabled?: boolean;
    readonly?: boolean;
    checked?: boolean | 'mixed';
    expanded?: boolean;
    hasValue?: boolean;
    value?: string | string[];
    sensitive?: boolean;
    options?: RawOption[];
    optionsTotal?: number;
    constraints?: Record<string, unknown>;
    validity?: {
        valid: boolean;
        flags?: string[];
        validationMessage?: string;
    };
    actions: string[];
    cands?: RawCandidate[];
}
interface RawLink {
    id: number;
    path: string[];
    text: string;
    href: string;
    visible: boolean;
    target?: string;
    cands: RawCandidate[];
}
interface RawTable {
    id: number;
    path: string[];
    name?: string;
    headers: string[];
    rows: string[][];
    totalRows: number;
    declaredRows?: number;
    coverage: 'complete' | 'partial';
    reason?: string;
    cands: RawCandidate[];
}
interface RawFrame {
    framePath: string[];
    src?: string;
    url?: string;
    sameOrigin?: boolean;
    crossOrigin?: boolean;
    limitation?: string;
    skipped?: string;
}
export interface RawScan {
    controls: RawControl[];
    links: RawLink[];
    tables: RawTable[];
    frames: RawFrame[];
    /** Iframes past the 50th, not listed at all. */
    framesOmitted?: number;
    counts: {
        controls: number;
        links: number;
        tables: number;
    };
    shadowRoots: number;
}
/** Where the scan root sits relative to the page: the iframe selectors that lead to it. */
interface ScopeBase {
    framePath: string[];
    frame?: BrowserFrameSpec;
}
declare function scopeBase(target: BrowserTarget | undefined): ScopeBase;
/** Run the in-page scan on the whole document, or on the one element a strict locator names. */
export declare function scanPage(page: any, request: ObserveRequest, base: ScopeBase): Promise<RawScan>;
type Json = Record<string, unknown>;
export interface ObservedSections {
    controls?: Json[];
    links?: Json[];
    tables?: Json[];
    frames?: Json[];
    counts: Json;
    limits: string[];
}
/** Check every candidate on the live page and build the records. */
export declare function describeScan(page: any, raw: RawScan, request: ObserveRequest, base: ScopeBase): Promise<ObservedSections>;
export { scopeBase };
export interface FitInput {
    /** Everything outside the sections: url, title, targetId, generation, counts, frames, limits. */
    head: Json;
    text?: string;
    controls?: Json[];
    links?: Json[];
    tables?: Json[];
}
export interface Truncation {
    omittedBySection: Record<string, number>;
    reason: string;
}
/**
 * Shrink the sections until the serialized record fits `maxBytes`. The largest section is shaved first,
 * a step at a time, so the budget ends up shared instead of one section taking all of it. Items and rows
 * are dropped whole and text is cut at a character, so the JSON stays valid. `found` is how many items
 * the page had per section before maxItems applied.
 */
export declare function fitObservation(input: FitInput, maxBytes: number, found: {
    controls?: number;
    links?: number;
    tables?: number;
}, maxItems: number): {
    record: Json;
    truncation?: Truncation;
};
