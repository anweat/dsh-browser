import { BrowserSettingsController } from "./form.js";
import { SettingsCard } from "./SettingsCard.js";
import { en, zh } from "./locales.js";
import { ensureStyles } from "./styles.js";
import { SETTINGS_NAMESPACE } from "./settings-namespace.js";
import { AutomationAssetsController } from "./automation-assets-client.js";
export const name = 'dsh-browser-client';
export const inject = ['slots', 'locale', 'connection', 'settingsScope'];
export const NS = 'dsh-browser.card';
export { SETTINGS_NAMESPACE };
export function apply(ctx) {
    ensureStyles();
    ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-browser: settings dictionaries');
    const scope = ctx.settingsScope.bind({ namespace: SETTINGS_NAMESPACE });
    const controller = new BrowserSettingsController(scope);
    const assets = new AutomationAssetsController(ctx.connection.rpc);
    ctx.effect(() => () => controller.dispose(), 'dsh-browser: settings controller');
    ctx.effect(() => () => assets.dispose(), 'dsh-browser: automation assets controller');
    ctx.slots.inject('settings.plugin.item', () => ctx.slots.register({
        name: 'settings.plugin.item', key: SETTINGS_NAMESPACE, locale: NS,
        inject: () => {
            const settingsProps = controller.inject();
            const assetProps = assets.inject();
            return { ...settingsProps, ...assetProps, hooks: { ...settingsProps.hooks, ...assetProps.hooks } };
        },
    }, SettingsCard));
}
//# sourceMappingURL=index.js.map