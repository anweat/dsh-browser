import { BrowserSettingsController } from "./form.js";
import { SettingsCard } from "./SettingsCard.js";
import { en, zh } from "./locales.js";
import { ensureStyles } from "./styles.js";
import { SETTINGS_NAMESPACE } from "./settings-namespace.js";
export const name = 'dsh-browser-client';
export const inject = ['slots', 'locale', 'connection', 'settingsScope'];
export const NS = 'dsh-browser.card';
export { SETTINGS_NAMESPACE };
export function apply(ctx) {
    ensureStyles();
    ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-browser: settings dictionaries');
    const scope = ctx.settingsScope.bind({ namespace: SETTINGS_NAMESPACE });
    const controller = new BrowserSettingsController(scope);
    ctx.effect(() => () => controller.dispose(), 'dsh-browser: settings controller');
    ctx.slots.inject('settings.plugin.item', () => ctx.slots.register({ name: 'settings.plugin.item', key: SETTINGS_NAMESPACE, locale: NS, inject: () => controller.inject() }, SettingsCard));
}
//# sourceMappingURL=index.js.map