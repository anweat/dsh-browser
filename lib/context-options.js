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
export const VIEWPORT_MODES = ['window', '720p', '1080p', 'custom'];
/** Bounds of a custom viewport, in CSS pixels. */
export const VIEWPORT_LIMITS = { minWidth: 200, maxWidth: 7680, minHeight: 200, maxHeight: 4320 };
const PRESET_VIEWPORTS = {
    '720p': { width: 1280, height: 720 },
    '1080p': { width: 1920, height: 1080 },
};
// A user agent is one header value; control characters would split it.
const CONTROL = /[\u0000-\u001f\u007f]/;
const PROXY_SCHEMES = ['http:', 'https:', 'socks5:', 'socks4:'];
function checkInteger(value, label, min, max, fail) {
    if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
        fail(`${label} must be an integer from ${min} to ${max}`);
    }
    return value;
}
export function checkViewport(width, height, label, fail) {
    return {
        width: checkInteger(width, `${label} width`, VIEWPORT_LIMITS.minWidth, VIEWPORT_LIMITS.maxWidth, fail),
        height: checkInteger(height, `${label} height`, VIEWPORT_LIMITS.minHeight, VIEWPORT_LIMITS.maxHeight, fail),
    };
}
export function checkUserAgent(value, label, fail) {
    if (typeof value !== 'string' || !value.trim() || value.length > 512 || CONTROL.test(value)) {
        fail(`${label} must be 1 to 512 characters without control characters`);
    }
    return value.trim();
}
export function checkLocale(value, label, fail) {
    if (typeof value !== 'string' || !value.trim())
        fail(`${label} must be a BCP 47 language tag such as en-US or zh-CN`);
    try {
        const [canonical] = Intl.getCanonicalLocales(value.trim());
        if (canonical)
            return canonical;
    }
    catch { /* falls through to the failure below */ }
    return fail(`${label} "${String(value)}" is not a valid BCP 47 language tag (examples: en-US, zh-CN, de-DE)`);
}
export function checkTimezone(value, label, fail) {
    if (typeof value !== 'string' || !value.trim())
        fail(`${label} must be an IANA time zone such as Asia/Shanghai or America/New_York`);
    const zone = value.trim();
    try {
        new Intl.DateTimeFormat('en-US', { timeZone: zone });
        return zone;
    }
    catch {
        return fail(`${label} "${zone}" is not a known IANA time zone (examples: Asia/Shanghai, America/New_York, UTC)`);
    }
}
/**
 * A proxy server address: `http://host:port`, `https://...`, `socks5://...` or `socks4://...`; a bare
 * `host:port` means http. Anything carrying credentials is refused.
 */
export function checkProxyServer(value, label, fail) {
    if (typeof value !== 'string' || !value.trim() || value.length > 512 || CONTROL.test(value)) {
        fail(`${label} must be a proxy address such as http://127.0.0.1:7890 or socks5://127.0.0.1:1080`);
    }
    const raw = value.trim();
    const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : 'http://' + raw;
    let parsed;
    try {
        parsed = new URL(withScheme);
    }
    catch {
        return fail(`${label} "${raw}" is not a valid proxy address (expected scheme://host:port)`);
    }
    if (!PROXY_SCHEMES.includes(parsed.protocol))
        fail(`${label} scheme must be one of http, https, socks5, socks4 (got ${parsed.protocol.replace(':', '')})`);
    if (parsed.username || parsed.password)
        fail(`${label} must not contain credentials; proxy accounts are not supported`);
    if (!parsed.hostname)
        fail(`${label} "${raw}" has no host`);
    if ((parsed.pathname !== '/' && parsed.pathname !== '') || parsed.search || parsed.hash)
        fail(`${label} must be only scheme://host:port, without a path or query`);
    return `${parsed.protocol}//${parsed.host}`;
}
export function checkProxyBypass(value, label, fail) {
    if (typeof value !== 'string' || !value.trim() || value.length > 1_000 || CONTROL.test(value)) {
        fail(`${label} must be a comma-separated host list of up to 1000 characters, such as example.com,.internal.test`);
    }
    return value.split(',').map(part => part.trim()).filter(Boolean).join(',');
}
const configFail = (message) => { throw new Error('dsh-browser config: ' + message); };
const blank = (value) => value === undefined || value === null || value === '';
/**
 * Read the context defaults from the configuration. A wrong value throws a message that names the key;
 * a combination that merely has no effect (a custom size under another mode, a bypass list without a proxy)
 * is returned as a warning and ignored.
 */
export function resolveContextDefaults(input) {
    const warnings = [];
    const options = {};
    const mode = blank(input.viewportMode) ? 'window' : input.viewportMode;
    if (typeof mode !== 'string' || !VIEWPORT_MODES.includes(mode)) {
        configFail('viewportMode must be one of: ' + VIEWPORT_MODES.join(', '));
    }
    const hasSize = !blank(input.viewportWidth) || !blank(input.viewportHeight);
    if (mode === 'custom') {
        if (blank(input.viewportWidth) || blank(input.viewportHeight))
            configFail('viewportMode=custom requires both viewportWidth and viewportHeight');
        options.viewport = checkViewport(input.viewportWidth, input.viewportHeight, 'viewport', configFail);
    }
    else if (mode === '720p' || mode === '1080p') {
        options.viewport = { ...PRESET_VIEWPORTS[mode] };
        if (hasSize)
            warnings.push(`viewportWidth/viewportHeight are ignored: they only apply with viewportMode=custom (viewportMode is ${mode})`);
    }
    else if (hasSize) {
        warnings.push('viewportWidth/viewportHeight are ignored: they only apply with viewportMode=custom (viewportMode is window)');
    }
    if (!blank(input.userAgent))
        options.userAgent = checkUserAgent(input.userAgent, 'userAgent', configFail);
    if (!blank(input.locale))
        options.locale = checkLocale(input.locale, 'locale', configFail);
    if (!blank(input.timezoneId))
        options.timezoneId = checkTimezone(input.timezoneId, 'timezoneId', configFail);
    if (!blank(input.proxyServer)) {
        options.proxy = { server: checkProxyServer(input.proxyServer, 'proxyServer', configFail) };
        if (!blank(input.proxyBypass))
            options.proxy.bypass = checkProxyBypass(input.proxyBypass, 'proxyBypass', configFail);
    }
    else if (!blank(input.proxyBypass)) {
        warnings.push('proxyBypass is ignored: it only applies together with proxyServer');
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