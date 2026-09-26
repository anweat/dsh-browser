/**
 * Host-version-adaptive settings scope resolution.
 *
 * DSH changed how a plugin declares its editable configuration section:
 *
 * - Older hosts (dsh-v0.1.1-rc.2 … v0.1.5-alpha.1) exposed a standalone
 *   `settingsNamespace()` helper plus a `settings.register(ns, schema, opts)`
 *   provider method. The plugin owned a mutable source ref and read the
 *   registered scope on every operation.
 * - Newer hosts (dsh-v0.1.7-rc.2+) removed both. Settings pages are derived
 *   from the Loader entry's own `Config` schema, and `SettingsForms` exposes
 *   only `configure/describe/update/replace/mutate` — there is no `register`.
 *   The host re-validates the entry config and restarts the plugin fiber, so
 *   the value handed to `apply(ctx, config)` is already the live resolved one.
 *
 * Calling `settings.register` unconditionally therefore throws
 * `TypeError: settings.register is not a function` on a newer host and aborts
 * the whole plugin fiber, so this module probes for the method and degrades to
 * the entry-config path instead.
 * @module dsh-browser/settings-scope
 */
/** Narrow an unknown service to the legacy registering shape. */
function legacyRegister(settings) {
    if (settings === null || typeof settings !== 'object')
        return undefined;
    const candidate = settings.register;
    return typeof candidate === 'function'
        ? candidate.bind(settings)
        : undefined;
}
/**
 * Register the plugin's settings section when the host supports it, and
 * otherwise fall back to the Loader-managed entry config.
 *
 * @param settings - the injected `ctx.settings` service, or undefined when the
 *   host composes none.
 * @param namespace - the settings namespace / loader entry id (e.g. `browser`).
 * @param schema - the plugin's schemastery `Config` schema.
 * @param entryConfig - the config the host passed into `apply`.
 * @returns a version-independent reader for the current configuration.
 */
export function resolveSettingsScope(settings, namespace, schema, entryConfig) {
    const register = legacyRegister(settings);
    if (register === undefined)
        return { get: () => entryConfig, mode: 'entry' };
    // The legacy provider is present: keep reading through it so live edits are
    // visible without a fiber restart (the historical behaviour on those hosts).
    const scope = register(namespace, schema, { base: entryConfig, applies: 'restart' });
    return { get: () => scope.get(), mode: 'scope' };
}
//# sourceMappingURL=settings-scope.js.map