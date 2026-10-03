/**
 * The in-page half of observe.read: one function, shipped to the page as source text.
 *
 * It is a raw string on purpose: it runs inside the page, so it must not carry transpiler helpers, and
 * it must not use template literals (the string is written with String.raw). It reads the DOM and
 * returns plain data; it never changes the page. The only thing it leaves behind is a WeakMap stored
 * under a registered symbol on each scanned window, which maps each listed element to its number, so
 * that the Node side can later prove that a candidate locator points at that very element.
 *
 * Coverage: the document, open shadow roots (recursively), and same-origin iframes (recursively, up to
 * the frame-path limit). A cross-origin or sandboxed iframe is listed as a frame with its limitation,
 * never entered. Closed shadow roots cannot be seen from page script and are not covered.
 * @module dsh-browser/observe-script
 */
/** Symbol (registered with Symbol.for) under which each scanned window keeps its element-number map. */
export declare const OBSERVE_SYMBOL = "dsh.observe";
/** Maximum iframe nesting the scan enters; matches the locator framePath limit. */
export declare const OBSERVE_MAX_FRAME_DEPTH = 5;
/** Maximum number of iframes entered in one observation. */
export declare const OBSERVE_MAX_FRAMES = 20;
/** Reads, in the element's own window, the numbers of the elements a locator matched. */
export declare const IDENTITY_SOURCE: string;
/**
 * `(root, opts) => result`. `root` is a Document or the Element an observation is scoped to.
 * opts: { controls, links, tables, maxItems, includeValues, region?, maxFrameDepth, maxFrames }.
 */
export declare const OBSERVE_SOURCE: string;
