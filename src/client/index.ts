import type { SettingsScope } from '@deepseek-ai/dsh-client-runtime/client'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { Context } from './context-types.ts'
import { BrowserSettingsController, type BrowserCardState, type SettingField } from './form.ts'
import { SettingsCard } from './SettingsCard.tsx'
import { en, zh } from './locales.ts'
import { ensureStyles } from './styles.ts'
import { SETTINGS_NAMESPACE } from './settings-namespace.ts'

export const name = 'dsh-browser-client'
export const inject = ['slots', 'locale', 'connection', 'settingsScope']
export const NS = 'dsh-browser.card'
export { SETTINGS_NAMESPACE }

export type BrowserSettingsCardProps = PropsLocale<typeof NS> & {
  useBrowserSettings: <R>(selector: (snapshot: BrowserCardState) => R) => R
  edit: (field: SettingField, text: string) => void
  resetField: (field: SettingField) => void
  save: () => void
  discard: () => void
}

export function apply(ctx: Context): void {
  ensureStyles()
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-browser: settings dictionaries')
  const scope = ctx.settingsScope.bind({ namespace: SETTINGS_NAMESPACE }) as SettingsScope<Record<string, unknown>>
  const controller = new BrowserSettingsController(scope)
  ctx.effect(() => () => controller.dispose(), 'dsh-browser: settings controller')
  ctx.slots.inject('settings.plugin.item', () => ctx.slots.register({ name: 'settings.plugin.item', key: SETTINGS_NAMESPACE, locale: NS, inject: () => controller.inject() }, SettingsCard))
}
