/**
 * One locator contract for atomic actions and v2 recipe steps.
 *
 * A locator is strict by default: it must match exactly one element. When it
 * matches several, the step is not performed and the caller gets
 * {@link LocatorAmbiguousError} with a short summary of the first candidates, so
 * the model can tell which element it meant instead of acting on whichever one
 * happened to come first. Choosing one anyway takes an explicit `index` with an
 * `indexReason`; `explicitFirst` is the marker a v1 migration leaves behind for
 * "this used to be `.first()`".
 * @module dsh-browser/locator
 */
export interface BrowserFrameSpec {
    selector?: string;
    name?: string;
    url?: string;
}
export interface BrowserLocatorSpec {
    /** CSS selector. `css` is accepted as an alias (the v2 recipe spelling). */
    selector?: string;
    css?: string;
    role?: string;
    name?: string;
    text?: string;
    label?: string;
    testId?: string;
    exact?: boolean;
    /** Atomic-action iframe: exactly one of selector, name, url. */
    frame?: BrowserFrameSpec;
    /** Nested iframes, outermost first, each a CSS selector for an iframe element. */
    framePath?: string[];
    /** Pick the n-th match (0-based). Requires `indexReason`. */
    index?: number;
    indexReason?: string;
    /** Take the first match without an ambiguity error. Set by the v1 converter; meant to be resolved later. */
    explicitFirst?: boolean;
}
export type BrowserTarget = string | BrowserLocatorSpec;
/** What one of several matches looks like, enough to choose between them. */
export interface LocatorCandidate {
    index: number;
    role: string;
    name: string;
    text: string;
    visible: boolean;
}
export interface LocatorAmbiguity {
    total: number;
    items: LocatorCandidate[];
}
/** Raised instead of acting when a strict locator matches more than one element. */
export declare class LocatorAmbiguousError extends Error {
    readonly ambiguity: LocatorAmbiguity;
    constructor(message: string, ambiguity: LocatorAmbiguity);
}
/** Where a page stands now: what a stale caller needs to re-bind to it. */
export interface PageGeneration {
    targetId: string;
    generation: number;
}
/** Raised, before anything is done, when `expectGeneration` is not the page's current generation. */
export declare class TargetStaleError extends Error {
    readonly current: PageGeneration;
    constructor(message: string, current: PageGeneration);
}
export declare const MAX_CANDIDATES = 5;
/** Check a locator's shape. Throws a message the model can act on; used before resolving and when a recipe is saved. */
export declare function validateLocatorSpec(spec: unknown, label?: string): BrowserLocatorSpec;
/**
 * Build the Playwright locator for a target. No `.first()` unless the spec asks
 * for it, so Playwright's own strict-mode check stays in force.
 */
export declare function resolveLocator(page: any, target: BrowserTarget): any;
/** The first candidates of a locator, best effort: a failure here must not hide the ambiguity itself. */
export declare function describeCandidates(locator: any): Promise<LocatorAmbiguity>;
export declare function formatCandidates(ambiguity: LocatorAmbiguity): string;
/**
 * Run an action on a strict locator. If the locator turns out to match several
 * elements, nothing was acted on (Playwright checks before it acts) and the
 * error is upgraded with the candidate summary.
 */
export declare function withStrictLocator<T>(locator: any, run: (locator: any) => Promise<T>): Promise<T>;
