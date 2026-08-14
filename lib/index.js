/**
 * dsh-browser — self-contained browser runtime plugin for DeepSeek Harness.
 *
 * Bundles Playwright (chromium) + OpenCLI as plugin-local npm dependencies and
 * provides a `browser` service for other plugins (web-search-pro injects it),
 * plus model-facing interactive browser tools.
 * @module dsh-browser
 */
import fs from 'node:fs';
import path from 'node:path';
import { Config, resolveConfig } from "./config.js";
import { BrowserService } from "./browser-service.js";
import { registerTools } from "./tools.js";
export const name = 'dsh-browser';
export const inject = ['tools'];
export { Config };
export function apply(ctx, config) {
    const resolved = resolveConfig(config);
    fs.mkdirSync(resolved.snapshotDir, { recursive: true });
    const service = new BrowserService(resolved);
    // Provide the `browser` service so consumers (web-search-pro) can inject it.
    // ctx.provide is scoped to this plugin's fiber; the browser instance itself
    // is closed via the effect disposer below.
    ctx.provide('browser', service);
    ctx.effect(() => () => void service.close());
    registerTools(ctx, resolved, service);
    if (resolved.verbose) {
        try {
            const markerPath = path.join(resolved.snapshotDir, 'apply.log');
            fs.appendFileSync(markerPath, JSON.stringify({
                ts: new Date().toISOString(),
                plugin: name,
                channel: resolved.channel,
                headless: resolved.headless,
                opencliEnabled: resolved.opencliEnabled,
                snapshotDir: resolved.snapshotDir,
            }) + '\n', 'utf8');
        }
        catch { /* marker is best-effort */ }
    }
    ctx.logger?.(name).info('dsh-browser loaded: channel=' + resolved.channel + ' headless=' + resolved.headless + ' opencli=' + resolved.opencliEnabled);
}
//# sourceMappingURL=index.js.map