import { BrowserSettingsController } from "./form.js";
import { PromptsStatusController } from "./prompts-status-client.js";
import { SettingsCard } from "./SettingsCard.js";
import { en, zh } from "./locales.js";
import { ensureStyles } from "./styles.js";
import { SETTINGS_NAMESPACE } from "./settings-namespace.js";
import { AutomationAssetsController } from "./automation-assets-client.js";
export const name = 'dsh-browser-client';
export const inject = ['slots', 'locale', 'connection', 'configForms'];
export const NS = 'dsh-browser.card';
export { SETTINGS_NAMESPACE };
export function apply(ctx) {
    ensureStyles();
    ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-browser: settings dictionaries');
    // The Host derives the settings page from the plugin entry's own Config
    // schema, keyed by the loader entry id; the shared form service reads it.
    const controller = new BrowserSettingsController(ctx.configForms.get(SETTINGS_NAMESPACE));
    const assets = new AutomationAssetsController(ctx.connection.rpc);
    const prompts = new PromptsStatusController(ctx.connection.rpc);
    ctx.effect(() => () => controller.dispose(), 'dsh-browser: settings controller');
    ctx.effect(() => () => prompts.dispose(), 'dsh-browser: prompts status controller');
    ctx.effect(() => () => assets.dispose(), 'dsh-browser: automation assets controller');
    // External bundles own their keyed configuration on the bundle's detail
    // page; `plugins.item` is reserved for official host-plane plugins.
    ctx.effect(() => ctx.configForms.whileServed([SETTINGS_NAMESPACE], () => ctx.slots.inject('plugins.bundle.config', () => ctx.slots.register({
        name: 'plugins.bundle.config', key: '@anweat/dsh-browser', locale: NS,
        inject: () => {
            const settingsProps = controller.inject();
            const assetProps = assets.inject();
            const promptsProps = prompts.inject();
            return { ...settingsProps, ...assetProps, ...promptsProps, hooks: { ...settingsProps.hooks, ...assetProps.hooks, ...promptsProps.hooks } };
        },
    }, SettingsCard))), 'dsh-browser: settings page');
}
//# sourceMappingURL=index.js.map