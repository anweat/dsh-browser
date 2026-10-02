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
import { resolveBrowserCall } from "./actions/surface.js";
import { registerSkillWhenAvailable } from "./skill.js";
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
export { AUTOMATION_MODES, TOOL_SURFACES, ALL_BROWSER_ACTION_NAMES, browserActionsForMode, configuredBrowserActions, configuredBrowserTools } from "./freedom.js";
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
    // Apply the configured exposure/approval mode before every browser call.
    // Approval is decided per ACTION: browser_call (and each flat tool) is
    // resolved to its action and arguments first, so the user is asked about
    // `act.click #submit`, not about a generic dispatcher. browser_index only
    // reads the catalog and is let through. Validation remains active even when
    // unrestricted mode skips approvals.
    ctx.on('tools/pre-execute', async (exec, next) => {
        const downstream = await next();
        if (downstream.kind !== 'allow')
            return downstream;
        const call = resolveBrowserCall(exec.name, exec.arguments);
        // `unresolved` is a browser_call naming no known action: it runs no
        // action and returns a structured UNKNOWN_ACTION error, so nothing to approve.
        if (call?.kind === 'index' || call?.kind === 'unresolved')
            return downstream;
        if (call?.kind === 'action') {
            // automation.run and automation.develop test act on a stored asset: the policy needs to know what kind it is,
            // and for a recipe draft which steps it would replay.
            const callArgs = (call.args ?? {});
            const replaysAsset = call.action === 'automation.run' || (call.action === 'automation.develop' && callArgs.action === 'test');
            const target = replaysAsset && typeof callArgs.id === 'string' ? assets.get(callArgs.id) : undefined;
            return browserPolicyDecision(call.action, call.args, resolved.automationMode, target?.kind, call.action === 'automation.develop' ? target?.recipe : undefined);
        }
        return browserPolicyDecision(exec.name, exec.arguments, resolved.automationMode);
    });
    // Provide the `browser` service so consumers (web-search-pro) can inject it.
    // ctx.provide is scoped to this plugin's fiber; the browser instance itself
    // is closed via the effect disposer below.
    ctx.provide('browser', service);
    ctx.effect(() => () => void service.close());
    // Optional: the `dsh-browser` skill is registered only when the Host has a
    // skill registry. It must not be a declared `inject` (Cordis 4.0.4 would
    // hang the plugin without it); this opens a scoped, optional dependency.
    const skill = registerSkillWhenAvailable(ctx);
    registerTools(ctx, resolved, service, assets, { skillAvailable: skill.isAvailable });
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
                toolSurface: resolved.toolSurface,
                snapshotDir: resolved.snapshotDir,
            }) + '\n', 'utf8');
        }
        catch { /* marker is best-effort */ }
    }
    ctx.logger?.(name).info('dsh-browser loaded: channel=' + resolved.channel + ' headless=' + resolved.headless + ' opencli=' + resolved.opencliEnabled + ' automation=' + resolved.automationMode + ' surface=' + resolved.toolSurface);
}
//# sourceMappingURL=index.js.map