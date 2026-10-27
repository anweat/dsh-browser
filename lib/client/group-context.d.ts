/**
 * "Page environment": what every new browser context starts from (viewport, user agent, language, time zone, proxy).
 * The agent copies these for a task and changes only what the task needs, so they are plain defaults here.
 *
 * Conditional rows (the custom size, the proxy address) exist only while they apply; the settings are still in the
 * configuration when hidden, which is what lets the render test count every public field exactly once.
 * @module dsh-browser/client/group-context
 */
import { type Card } from './field-rows.tsx';
export declare const CONTEXT_FIELDS: readonly ["viewportMode", "viewportWidth", "viewportHeight", "userAgent", "locale", "timezoneId", "proxyServer", "proxyBypass"];
/** Common user agents; the browser's own is the empty one. Version numbers are examples: a site that checks them needs the custom entry. */
export declare const USER_AGENT_PRESETS: {
    readonly chromeMac: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
    readonly chromeWin: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
    readonly iphone: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
};
export declare const LOCALE_SUGGESTIONS: readonly ["en-US", "en-GB", "zh-CN", "zh-TW", "ja-JP", "ko-KR", "de-DE", "fr-FR", "es-ES", "pt-BR", "ru-RU"];
export declare function ContextGroup({ card }: {
    card: Card;
}): import("react").JSX.Element;
