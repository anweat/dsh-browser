/**
 * The value rules of the context and download settings, with no imports at all: the server (config parsing, per-call
 * arguments) and the settings card (inline validation before a save) run the same functions, so the two cannot drift.
 * The caller supplies `fail`, which throws whatever error type suits it.
 * @module dsh-browser/config-rules
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
/** Upper bound of downloadMaxBytes: 10 GiB. */
export declare const MAX_DOWNLOAD_BYTES_LIMIT: number;
export declare const PRESET_VIEWPORTS: Record<'720p' | '1080p', {
    width: number;
    height: number;
}>;
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
/** A directory setting must be an absolute path (POSIX, drive letter, or UNC); a relative one would depend on the host's working directory. */
export declare function checkAbsoluteDirectory(value: unknown, label: string, fail: Fail): string;
/** The Fail type for callers that do not import it separately. */
export type RuleFail = Fail;
export {};
