import type { SettingsScope } from '@deepseek-ai/dsh-client-ui-settings/client'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { Context } from './context-types.ts'
import { BrowserSettingsController, type BrowserCardState, type SettingField } from './form.ts'
import { SettingsCard } from './SettingsCard.tsx'
import { en, zh } from './locales.ts'
import { ensureStyles } from './styles.ts'
import { SETTINGS_NAMESPACE } from './settings-namespace.ts'
import { AutomationAssetsController, type AutomationAssetsState } from './automation-assets-client.ts'
import type { AutomationAsset, AutomationAssetStatus } from '../automation-assets.ts'
import type { ClientConnectionRpc } from '@deepseek-ai/dsh-client-connection/client'

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
  useAutomationAssets: <R>(selector: (snapshot: AutomationAssetsState) => R) => R
  refreshAutomationAssets: () => void
  selectAutomationAsset: (id?: string) => void
  saveAutomationAsset: (asset: Partial<AutomationAsset> & Pick<AutomationAsset, 'kind' | 'name'>) => Promise<void>
  summarizeAutomationCandidate: (id: string) => Promise<void>
  dismissAutomationCandidate: (id: string) => Promise<void>
  validateAutomationAsset: (id: string) => Promise<void>
  testAutomationAsset: (id: string, url: string, inputs: Record<string, string>) => Promise<void>
  setAutomationAssetStatus: (id: string, status: AutomationAssetStatus) => Promise<void>
}

export function apply(ctx: Context): void {
  ensureStyles()
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-browser: settings dictionaries')
  const scope = ctx.settingsScope.bind({ namespace: SETTINGS_NAMESPACE }) as SettingsScope<Record<string, unknown>>
  const controller = new BrowserSettingsController(scope)
  const assets = new AutomationAssetsController((ctx as unknown as { connection: { rpc: ClientConnectionRpc } }).connection.rpc)
  ctx.effect(() => () => controller.dispose(), 'dsh-browser: settings controller')
  ctx.effect(() => () => assets.dispose(), 'dsh-browser: automation assets controller')
  ctx.slots.inject('settings.plugin.item', () => ctx.slots.register({
    name: 'settings.plugin.item', key: SETTINGS_NAMESPACE, locale: NS,
    inject: () => {
      const settingsProps = controller.inject()
      const assetProps = assets.inject()
      return { ...settingsProps, ...assetProps, hooks: { ...settingsProps.hooks, ...assetProps.hooks } }
    },
  }, SettingsCard))
}
