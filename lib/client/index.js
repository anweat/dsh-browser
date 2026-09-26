import { BrowserSettingsController } from "./form.js";
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
    ctx.effect(() => () => controller.dispose(), 'dsh-browser: settings controller');
    ctx.effect(() => () => assets.dispose(), 'dsh-browser: automation assets controller');
    // Register the page into the Plugins page's `plugins.item` slot only while the
    // Host actually serves this namespace, so a deployment that exposes no browser
    // settings shows no trace of the card. The page renders the title from `label`
    // and the one-liner from the component's `summary` view.
    const t = ctx.locale.bind(NS);
    ctx.effect(() => ctx.configForms.whileServed([SETTINGS_NAMESPACE], () => ctx.slots.inject('plugins.item', () => ctx.slots.register({
        name: 'plugins.item', id: SETTINGS_NAMESPACE, order: 20,
        label: () => t('title'), locale: NS,
        inject: () => {
            const settingsProps = controller.inject();
            const assetProps = assets.inject();
            return { ...settingsProps, ...assetProps, hooks: { ...settingsProps.hooks, ...assetProps.hooks } };
        },
    }, SettingsCard))), 'dsh-browser: settings page');
}
//# sourceMappingURL=index.js.map