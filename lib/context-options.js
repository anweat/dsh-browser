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
import { ActionArgError } from "./actions/types.js";
export { VIEWPORT_MODES, VIEWPORT_LIMITS, checkViewport, checkUserAgent, checkLocale, checkTimezone, checkProxyServer, checkProxyBypass, } from "./config-rules.js";
import { VIEWPORT_MODES, PRESET_VIEWPORTS, checkViewport, checkUserAgent, checkLocale, checkTimezone, checkProxyServer, checkProxyBypass, } from "./config-rules.js";
/** Thrown inside {@link resolveContextDefaults} by the shared rules; caught per key, never escapes. */
class ConfigValueError extends Error {
}
const configFail = (message) => { throw new ConfigValueError(message); };
const blank = (value) => value === undefined || value === null || value === '';
/** A short, safe rendering of a configured value for a warning (credentials in a proxy URL are masked). */
export function summarizeValue(value) {
    if (typeof value === 'number' || typeof value === 'boolean')
        return String(value);
    const text = typeof value === 'string' ? value : JSON.stringify(value) ?? String(value);
    return JSON.stringify(text.replace(/\/\/[^/@\s]*@/g, '//***@').slice(0, 60));
}
/** The warning for a configuration key whose value was refused: which key, what was there, why, what applies instead. */
export function configProblem(key, value, reason, fallback, fix) {
    return `config ${key}=${summarizeValue(value)} was ignored: ${reason}; ${fallback} instead. Fix: ${fix}`;
}
/**
 * Read the context defaults from the configuration. This never throws: a value that is refused is dropped, the key
 * falls back to its default (the browser's own behaviour), and the reason is returned as a warning that names the
 * key, the value and how to fix it. A configuration problem must not stop the plugin from loading, because a plugin
 * that does not load also takes its settings card with it.
 */
export function resolveContextDefaults(input) {
    const warnings = [];
    const options = {};
    const attempt = (key, value, fallback, fix, run) => {
        try {
            run();
        }
        catch (error) {
            if (!(error instanceof ConfigValueError))
                throw error;
            warnings.push(configProblem(key, value, error.message, fallback, fix));
        }
    };
    let mode = 'window';
    attempt('viewportMode', input.viewportMode, 'the browser\'s default window size applies', `use one of ${VIEWPORT_MODES.join(', ')}`, () => {
        if (blank(input.viewportMode))
            return;
        if (typeof input.viewportMode !== 'string' || !VIEWPORT_MODES.includes(input.viewportMode)) {
            configFail('viewportMode must be one of: ' + VIEWPORT_MODES.join(', '));
        }
        mode = input.viewportMode;
    });
    const hasSize = !blank(input.viewportWidth) || !blank(input.viewportHeight);
    if (mode === 'custom') {
        attempt('viewportMode', 'custom', 'the browser\'s default window size applies', 'set both viewportWidth (200-7680) and viewportHeight (200-4320), or choose window, 720p or 1080p', () => {
            if (blank(input.viewportWidth) || blank(input.viewportHeight))
                configFail('viewportMode=custom requires both viewportWidth and viewportHeight');
            options.viewport = checkViewport(input.viewportWidth, input.viewportHeight, 'viewport', configFail);
        });
    }
    else if (mode === '720p' || mode === '1080p') {
        options.viewport = { ...PRESET_VIEWPORTS[mode] };
        if (hasSize)
            warnings.push(`config viewportWidth/viewportHeight are ignored: they only apply with viewportMode=custom (viewportMode is ${mode})`);
    }
    else if (hasSize) {
        warnings.push('config viewportWidth/viewportHeight are ignored: they only apply with viewportMode=custom (viewportMode is window)');
    }
    const simple = [
        ['userAgent', input.userAgent, value => checkUserAgent(value, 'userAgent', configFail), value => { options.userAgent = value; }, 'use up to 512 characters without line breaks, or clear it'],
        ['locale', input.locale, value => checkLocale(value, 'locale', configFail), value => { options.locale = value; }, 'use a BCP 47 tag such as en-US or zh-CN, or clear it'],
        ['timezoneId', input.timezoneId, value => checkTimezone(value, 'timezoneId', configFail), value => { options.timezoneId = value; }, 'use an IANA time zone such as Asia/Shanghai, or clear it'],
    ];
    for (const [key, value, check, apply, fix] of simple) {
        if (blank(value))
            continue;
        attempt(key, value, 'the browser\'s own value applies', fix, () => apply(check(value)));
    }
    let proxyOk = false;
    if (!blank(input.proxyServer)) {
        attempt('proxyServer', input.proxyServer, 'no proxy is used (direct connection)', 'use http://host:port or socks5://host:port without an account or password, or clear it', () => {
            options.proxy = { server: checkProxyServer(input.proxyServer, 'proxyServer', configFail) };
            proxyOk = true;
        });
    }
    if (!blank(input.proxyBypass)) {
        if (proxyOk) {
            attempt('proxyBypass', input.proxyBypass, 'the bypass list is not applied', 'use comma-separated hosts such as example.com,.internal.test, or clear it', () => {
                options.proxy.bypass = checkProxyBypass(input.proxyBypass, 'proxyBypass', configFail);
            });
        }
        else
            warnings.push('config proxyBypass is ignored: it only applies together with a valid proxyServer');
    }
    return { options, warnings };
}
const callFail = (message) => { throw new ActionArgError(message); };
/** Validate per-call overrides. Throws {@link ActionArgError} (INVALID_ARGS) naming the argument. */
export function resolveCallOptions(input) {
    const options = {};
    if (!input)
        return options;
    if (input.viewport !== undefined) {
        if (typeof input.viewport !== 'object' || input.viewport === null)
            callFail('viewport must be an object {width, height}');
        options.viewport = checkViewport(input.viewport.width, input.viewport.height, 'viewport', callFail);
    }
    if (input.userAgent !== undefined)
        options.userAgent = checkUserAgent(input.userAgent, 'userAgent', callFail);
    if (input.locale !== undefined)
        options.locale = checkLocale(input.locale, 'locale', callFail);
    if (input.timezoneId !== undefined)
        options.timezoneId = checkTimezone(input.timezoneId, 'timezoneId', callFail);
    if (input.proxyServer !== undefined)
        options.proxy = { server: checkProxyServer(input.proxyServer, 'proxyServer', callFail) };
    return options;
}
/**
 * Configuration defaults overlaid with the per-call options. A per-call `proxyServer` replaces the configured
 * proxy as a whole, bypass list included: a bypass list written for one proxy says nothing about another.
 */
export function effectiveContextOptions(defaults, call = {}) {
    return {
        ...defaults,
        ...call,
    };
}
/** Whether two option sets would create indistinguishable contexts. */
export function sameContextOptions(a, b) {
    return (a.viewport?.width ?? 0) === (b.viewport?.width ?? 0)
        && (a.viewport?.height ?? 0) === (b.viewport?.height ?? 0)
        && a.userAgent === b.userAgent
        && a.locale === b.locale
        && a.timezoneId === b.timezoneId
        && a.proxy?.server === b.proxy?.server
        && a.proxy?.bypass === b.proxy?.bypass;
}
/** Names of the options that differ, for the "context was rebuilt" notice. */
export function differingContextOptions(applied, wanted) {
    const names = [];
    if ((applied.viewport?.width ?? 0) !== (wanted.viewport?.width ?? 0) || (applied.viewport?.height ?? 0) !== (wanted.viewport?.height ?? 0))
        names.push('viewport');
    if (applied.userAgent !== wanted.userAgent)
        names.push('userAgent');
    if (applied.locale !== wanted.locale)
        names.push('locale');
    if (applied.timezoneId !== wanted.timezoneId)
        names.push('timezoneId');
    if (applied.proxy?.server !== wanted.proxy?.server || applied.proxy?.bypass !== wanted.proxy?.bypass)
        names.push('proxyServer');
    return names;
}
/** The `newContext()` arguments for a set of options: only the fields that are set, so an unset field keeps today's behaviour. */
export function toPlaywrightOptions(options) {
    return {
        ...options.viewport ? { viewport: { ...options.viewport } } : {},
        ...options.userAgent ? { userAgent: options.userAgent } : {},
        ...options.locale ? { locale: options.locale } : {},
        ...options.timezoneId ? { timezoneId: options.timezoneId } : {},
        ...options.proxy ? { proxy: { server: options.proxy.server, ...options.proxy.bypass ? { bypass: options.proxy.bypass } : {} } } : {},
    };
}
/** The options as the model sees them in a result: only what was actually set. */
export function describeContextOptions(options) {
    return {
        ...options.viewport ? { viewport: { ...options.viewport } } : {},
        ...options.userAgent ? { userAgent: options.userAgent } : {},
        ...options.locale ? { locale: options.locale } : {},
        ...options.timezoneId ? { timezoneId: options.timezoneId } : {},
        ...options.proxy ? { proxyServer: options.proxy.server } : {},
    };
}
//# sourceMappingURL=context-options.js.map