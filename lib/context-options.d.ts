/**
 * Browser-context creation options: viewport, user agent, locale, time zone and proxy.
 *
 * These can only be chosen when a context is created (Playwright has no way to change a proxy or user agent
 * afterwards), so there are two layers: configuration defaults that apply to every context the plugin creates,
 * and per-call overrides on `target.open`. {@link effectiveContextOptions} merges the two into the one plain
 * shape {@link toPlaywrightOptions} turns into `browser.newContext()` arguments, and
 * {@link sameContextOptions} is what the session uses to decide between reusing its context and rebuilding it.
 *
 * Proxy credentials are deliberately not supported: a username or password would have to live in the
 * configuration or in a tool call, and neither is a place for secrets.
 * @module dsh-browser/context-options
 */
export declare const VIEWPORT_MODES: readonly ["window", "720p", "1080p", "custom"];
export type ViewportMode = typeof VIEWPORT_MODES[number];
/** Bounds of a custom viewport, in CSS pixels. */
export declare const VIEWPORT_LIMITS: {
    readonly minWidth: 200;
    readonly maxWidth: 7680;
    readonly minHeight: 200;
    readonly maxHeight: 4320;
};
/** The options a context is created with. Every field is optional; an absent field keeps Playwright's default. */
export interface ContextOptions {
    viewport?: {
        width: number;
        height: number;
    };
    userAgent?: string;
    locale?: string;
    timezoneId?: string;
    proxy?: {
        server: string;
        bypass?: string;
    };
}
/** The configuration keys behind {@link ContextOptions}, as `resolveConfig` reads them. */
export interface ContextOptionsInput {
    viewportMode?: unknown;
    viewportWidth?: unknown;
    viewportHeight?: unknown;
    userAgent?: unknown;
    locale?: unknown;
    timezoneId?: unknown;
    proxyServer?: unknown;
    proxyBypass?: unknown;
}
/** A configuration problem that is not fatal: the value is ignored and this is shown in `runtime.status`. */
export type ConfigWarning = string;
type Fail = (message: string) => never;
export declare function checkViewport(width: unknown, height: unknown, label: string, fail: Fail): {
    width: number;
    height: number;
};
export declare function checkUserAgent(value: unknown, label: string, fail: Fail): string;
export declare function checkLocale(value: unknown, label: string, fail: Fail): string;
export declare function checkTimezone(value: unknown, label: string, fail: Fail): string;
/**
 * A proxy server address: `http://host:port`, `https://...`, `socks5://...` or `socks4://...`; a bare
 * `host:port` means http. Anything carrying credentials is refused.
 */
export declare function checkProxyServer(value: unknown, label: string, fail: Fail): string;
export declare function checkProxyBypass(value: unknown, label: string, fail: Fail): string;
/**
 * Read the context defaults from the configuration. A wrong value throws a message that names the key;
 * a combination that merely has no effect (a custom size under another mode, a bypass list without a proxy)
 * is returned as a warning and ignored.
 */
export declare function resolveContextDefaults(input: ContextOptionsInput): {
    options: ContextOptions;
    warnings: ConfigWarning[];
};
/** The per-call options of `target.open`, as they arrive from the model. */
export interface CallContextInput {
    viewport?: {
        width?: unknown;
        height?: unknown;
    };
    userAgent?: unknown;
    locale?: unknown;
    timezoneId?: unknown;
    proxyServer?: unknown;
}
/** Validate per-call overrides. Throws {@link ActionArgError} (INVALID_ARGS) naming the argument. */
export declare function resolveCallOptions(input: CallContextInput | undefined): ContextOptions;
/**
 * Configuration defaults overlaid with the per-call options. A per-call `proxyServer` replaces the configured
 * proxy as a whole, bypass list included: a bypass list written for one proxy says nothing about another.
 */
export declare function effectiveContextOptions(defaults: ContextOptions, call?: ContextOptions): ContextOptions;
/** Whether two option sets would create indistinguishable contexts. */
export declare function sameContextOptions(a: ContextOptions, b: ContextOptions): boolean;
/** Names of the options that differ, for the "context was rebuilt" notice. */
export declare function differingContextOptions(applied: ContextOptions, wanted: ContextOptions): string[];
/** The `newContext()` arguments for a set of options: only the fields that are set, so an unset field keeps today's behaviour. */
export declare function toPlaywrightOptions(options: ContextOptions): Record<string, unknown>;
/** The options as the model sees them in a result: only what was actually set. */
export declare function describeContextOptions(options: ContextOptions): Record<string, unknown>;
export {};
