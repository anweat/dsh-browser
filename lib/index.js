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
import { browserPolicyDecision } from "./approval-policy.js";
import { AutomationAssetStore } from "./automation-assets.js";
import { registerAutomationAssetRpc } from "./automation-assets-rpc.js";
export const name = 'dsh-browser';
export const inject = ['tools'];
export { Config };
export { BUILTIN_SCRIPTS, validateUserscript } from "./scripts.js";
export { AUTOMATION_MODES, ALL_BROWSER_TOOL_NAMES, browserToolsForMode, configuredBrowserTools } from "./freedom.js";
export { ASSET_PERSISTENCE_MODES, ASSET_ACTIVATION_MODES, resolveAutomationAssetPolicy, AutomationAssetStore } from "./automation-assets.js";
export function apply(ctx, config) {
    const deployed = resolveConfig(config);
    let resolveSource = () => deployed;
    ctx.inject(['settings'], (settingsCtx) => {
        const settings = settingsCtx.settings;
        if (typeof settings?.register === 'function') {
            const scope = settings.register('browser', Config, {
                base: deployed,
                // Browser processes, tool exposure, and approval hooks are deliberately
                // startup-scoped. The next full profile start reads the persisted layer.
                applies: 'restart',
            });
            resolveSource = () => scope.get();
        }
    });
    const resolved = resolveConfig(resolveSource());
    fs.mkdirSync(resolved.snapshotDir, { recursive: true });
    const service = new BrowserService(resolved);
    const assets = new AutomationAssetStore(resolved.automationAssets);
    // Apply the configured exposure/approval mode before every browser tool.
    // Validation remains active even when unrestricted mode skips approvals.
    ctx.on('tools/pre-execute', async (exec, next) => {
        const downstream = await next();
        if (downstream.kind !== 'allow')
            return downstream;
        return browserPolicyDecision(exec.name, exec.arguments, resolved.automationMode);
    });
    // Provide the `browser` service so consumers (web-search-pro) can inject it.
    // ctx.provide is scoped to this plugin's fiber; the browser instance itself
    // is closed via the effect disposer below.
    ctx.provide('browser', service);
    ctx.effect(() => () => void service.close());
    registerTools(ctx, resolved, service, assets);
    registerAutomationAssetRpc(ctx, assets, service);
    if (resolved.verbose) {
        try {
            const markerPath = path.join(resolved.snapshotDir, 'apply.log');
            fs.appendFileSync(markerPath, JSON.stringify({
                ts: new Date().toISOString(),
                plugin: name,
                channel: resolved.channel,
                headless: resolved.headless,
                opencliEnabled: resolved.opencliEnabled,
                automationMode: resolved.automationMode,
                snapshotDir: resolved.snapshotDir,
            }) + '\n', 'utf8');
        }
        catch { /* marker is best-effort */ }
    }
    ctx.logger?.(name).info('dsh-browser loaded: channel=' + resolved.channel + ' headless=' + resolved.headless + ' opencli=' + resolved.opencliEnabled + ' automation=' + resolved.automationMode);
}
//# sourceMappingURL=index.js.map