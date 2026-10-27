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
export { VIEWPORT_MODES, VIEWPORT_LIMITS, checkViewport, checkUserAgent, checkLocale, checkTimezone, checkProxyServer, checkProxyBypass, type ViewportMode, } from './config-rules.ts';
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
/** A short, safe rendering of a configured value for a warning (credentials in a proxy URL are masked). */
export declare function summarizeValue(value: unknown): string;
/** The warning for a configuration key whose value was refused: which key, what was there, why, what applies instead. */
export declare function configProblem(key: string, value: unknown, reason: string, fallback: string, fix: string): ConfigWarning;
/**
 * Read the context defaults from the configuration. This never throws: a value that is refused is dropped, the key
 * falls back to its default (the browser's own behaviour), and the reason is returned as a warning that names the
 * key, the value and how to fix it. A configuration problem must not stop the plugin from loading, because a plugin
 * that does not load also takes its settings card with it.
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
/** Which parameter each value of an applied set comes from: this call, an earlier call of the session (carried by its context), or the defaults. */
export declare function contextSources(applied: ContextOptions, defaults: ContextOptions, call: ContextOptions): Record<string, 'call' | 'session' | 'default'>;
/** One line for the action detail: the context defaults in force, so a caller changes only what it needs. */
export declare function describeDefaultsLine(defaults: ContextOptions): string;
/** The options as the model sees them in a result: only what was actually set. */
export declare function describeContextOptions(options: ContextOptions): Record<string, unknown>;
