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
import { resolveSettingsScope } from "./settings-scope.js";
import { BrowserService } from "./browser-service.js";
import { registerTools } from "./tools.js";
import { browserPolicyDecision } from "./approval-policy.js";
import { AutomationAssetStore } from "./automation-assets.js";
import { registerAutomationAssetRpc } from "./automation-assets-rpc.js";
export const name = 'dsh-browser';
export const inject = ['tools', 'settings'];
/**
 * Loader entry id of this plugin's row in `cordis.patch.yml`, which is also the
 * settings namespace the plugin owns. On hosts whose `SettingsForms` still
 * exposes `register()` this is the scope namespace; on newer hosts it is the
 * profile patch entry id whose `Config` schema the settings page is derived
 * from. Keep it in sync with the bundle patch.
 */
export const BROWSER_SETTINGS_NS = 'browser';
/**
 * The object cordis actually receives.
 *
 * `Loader.unwrapExports(exports)` normalizes a module to ONE plugin object via
 * `exports.default ?? exports`, and cordis caches its runtime as
 * `{ name, callback, fibers, Config: plugin.Config }` off THAT object. A module
 * whose only `Config` is a named export therefore loses its schema: the plugin
 * still runs, but no settings page can ever be derived from it, and nothing
 * reports the omission. Exporting the assembled object as `default` is what
 * makes `Config` visible to the settings service.
 */
const plugin = { name: 'dsh-browser', inject: ['tools', 'settings'], apply, Config };
export default plugin;
export { Config };
export { BUILTIN_SCRIPTS, validateUserscript } from "./scripts.js";
export { AUTOMATION_MODES, ALL_BROWSER_TOOL_NAMES, browserToolsForMode, configuredBrowserTools } from "./freedom.js";
export { ASSET_PERSISTENCE_MODES, ASSET_ACTIVATION_MODES, resolveAutomationAssetPolicy, AutomationAssetStore } from "./automation-assets.js";
export function apply(ctx, config) {
    // Browser processes, tool exposure, and approval hooks are deliberately
    // startup-scoped. On hosts that still ship the legacy `settings.register`
    // provider we register a live scope; on dsh-v0.1.7-rc.2+ — which removed it
    // and derives settings pages from this entry's own Config schema — the
    // Loader re-applies the validated entry config by restarting this fiber.
    // The namespace is the bundle patch's loader entry id (`browser`), which is
    // also what the client settings card binds to.
    const settingsScope = resolveSettingsScope(ctx.settings, BROWSER_SETTINGS_NS, Config, config);
    const resolved = resolveConfig(settingsScope.get());
    fs.mkdirSync(resolved.snapshotDir, { recursive: true });
    const service = new BrowserService(resolved);
    const assets = new AutomationAssetStore(resolved.automationAssets);
    // Apply the configured exposure/approval mode before every browser tool.
    // Validation remains active even when unrestricted mode skips approvals.
    ctx.on('tools/pre-execute', async (exec, next) => {
        const downstream = await next();
        if (downstream.kind !== 'allow')
            return downstream;
        const assetId = exec.arguments?.id;
        const assetKind = exec.name === 'browser_automation_run' && typeof assetId === 'string'
            ? assets.get(assetId)?.kind : undefined;
        return browserPolicyDecision(exec.name, exec.arguments, resolved.automationMode, assetKind);
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