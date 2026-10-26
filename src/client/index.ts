import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { Context } from './context-types.ts'
import { BrowserSettingsController, type BrowserCardState } from './form.ts'
import type { PromptExtraKind, PromptExtraValue, PromptTextFieldId } from './prompts-form.ts'
import type { AuthProfileEntry } from './auth-profiles-form.ts'
import type { PolicyFieldName } from './policy-fields.ts'
import { PromptsStatusController, type PromptsStatusState } from './prompts-status-client.ts'
import { PolicyStatusController, type PolicyStatusState } from './policy-status-client.ts'
import { SettingsCard } from './SettingsCard.tsx'
import { en, zh } from './locales.ts'
import { ensureStyles } from './styles.ts'
import { SETTINGS_NAMESPACE } from './settings-namespace.ts'
import { AutomationAssetsController, type AutomationAssetsState } from './automation-assets-client.ts'
import type { AutomationAsset, AutomationAssetStatus } from '../automation-assets.ts'
import type { ClientConnectionRpc } from '@deepseek-ai/dsh-client-connection/client'

export const name = 'dsh-browser-client'
export const inject = ['slots', 'locale', 'connection', 'configForms']
export const NS = 'dsh-browser.card'
export { SETTINGS_NAMESPACE }

export type BrowserSettingsCardProps = PropsLocale<typeof NS> & {
  /** Which view the Plugins page is asking for: the one-liner or the form body. */
  view: 'summary' | 'page'
  useBrowserSettings: <R>(selector: (snapshot: BrowserCardState) => R) => R
  // Field names are plain strings: the form model accepts any section field,
  // including the JSON-shaped ones the card renders as code editors.
  edit: (field: string, text: string) => void
  resetField: (field: string) => void
  save: () => void
  discard: () => void
  /** The default-parameters editor (one `key = value` text over the plugin-wide defaults). */
  editProperties: (text: string) => void
  /** The language of the comments in the advanced text (`zh` or `en`). */
  setPropertyLanguage: (lang: string) => void
  resetProperty: (key: string) => void
  // The "prompt text" section: views of the one staged `prompts` draft.
  editPromptText: (id: PromptTextFieldId, text: string) => void
  setPromptSkillEnabled: (enabled: boolean) => void
  editPromptExtras: (text: string) => void
  resetPromptExtras: () => void
  /** One key of `usagePolicy` or `automationAssets` from its own control; an empty text puts the default back. */
  editPolicyKey: (field: PolicyFieldName, key: string, text: string) => void
  /** The login-profile list: add or replace one profile, or remove one, in the staged configuration. */
  saveAuthProfile: (id: string, entry: AuthProfileEntry) => void
  removeAuthProfile: (id: string) => void
  usePromptsStatus: <R>(selector: (snapshot: PromptsStatusState) => R) => R
  refreshPromptsStatus: () => void
  exportPromptDefaults: () => Promise<void>
  /** The default texts as commented YAML, in the given language (`en` or `zh`). */
  exportPromptYaml: (lang: string) => Promise<void>
  /** One entry of the groups / actions / errorHints overrides: a group summary, an action's summary and notes, or an error hint. */
  setPromptExtra: (kind: PromptExtraKind, key: string, value: PromptExtraValue | undefined) => void
  hidePromptDefaults: () => void
  usePolicyStatus: <R>(selector: (snapshot: PolicyStatusState) => R) => R
  refreshPolicyStatus: () => void
  clearPolicyOverlay: (scope?: 'all' | 'usagePolicy' | 'authProfile', id?: string) => Promise<void>
  useAutomationAssets: <R>(selector: (snapshot: AutomationAssetsState) => R) => R
  refreshAutomationAssets: () => void
  selectAutomationAsset: (id?: string) => void
  saveAutomationAsset: (asset: Partial<AutomationAsset> & Pick<AutomationAsset, 'kind' | 'name'>) => Promise<void>
  summarizeAutomationCandidate: (id: string) => Promise<void>
  dismissAutomationCandidate: (id: string) => Promise<void>
  validateAutomationAsset: (id: string) => Promise<void>
  testAutomationAsset: (id: string, url: string, inputs: Record<string, string>, expectedRevision?: number) => Promise<void>
  setAutomationAssetStatus: (id: string, status: AutomationAssetStatus, expectedRevision?: number) => Promise<void>
  // Editor: edits live in the controller, so every way out of them can ask first.
  editAutomationAsset: (text: string) => void
  setAssetTestUrl: (value: string) => void
  setAssetTestInputs: (value: string) => void
  requestSelectAutomationAsset: (id?: string) => void
  requestNewAutomationAsset: (kind: AutomationAsset['kind']) => void
  requestRefreshAutomationAssets: () => void
  requestForkAutomationAsset: (id: string) => void
  requestConvertAutomationAsset: (id: string) => void
  confirmLeaveAutomationAsset: () => void
  cancelLeaveAutomationAsset: () => void
  saveEditedAutomationAsset: () => Promise<unknown>
  saveAndTestAutomationAsset: () => Promise<void>
  activateAutomationAsset: () => Promise<void>
}

export function apply(ctx: Context): void {
  ensureStyles()
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-browser: settings dictionaries')

  // The Host derives the settings page from the plugin entry's own Config
  // schema, keyed by the loader entry id; the shared form service reads it.
  const rpc = (ctx as unknown as { connection: { rpc: ClientConnectionRpc } }).connection.rpc
  const assets = new AutomationAssetsController(rpc)
  const prompts = new PromptsStatusController(rpc)
  // The form compares prompt text with the plugin's own default text, which the prompts controller loads.
  const controller = new BrowserSettingsController(ctx.configForms.get<Record<string, unknown>>(SETTINGS_NAMESPACE), () => prompts.promptDefaults())
  const policy = new PolicyStatusController((ctx as unknown as { connection: { rpc: ClientConnectionRpc } }).connection.rpc)
  ctx.effect(() => () => controller.dispose(), 'dsh-browser: settings controller')
  ctx.effect(() => () => prompts.dispose(), 'dsh-browser: prompts status controller')
  ctx.effect(() => () => policy.dispose(), 'dsh-browser: policy status controller')
  ctx.effect(() => () => assets.dispose(), 'dsh-browser: automation assets controller')

  // External bundles own their keyed configuration on the bundle's detail
  // page; `plugins.item` is reserved for official host-plane plugins.
  ctx.effect(() => ctx.configForms.whileServed([SETTINGS_NAMESPACE], () =>
    ctx.slots.inject('plugins.bundle.config', () =>
      ctx.slots.register({
        name: 'plugins.bundle.config', key: '@anweat/dsh-browser', locale: NS,
        inject: () => {
          const settingsProps = controller.inject()
          const assetProps = assets.inject()
          const promptsProps = prompts.inject()
          const policyProps = policy.inject()
          return { ...settingsProps, ...assetProps, ...promptsProps, ...policyProps, hooks: { ...settingsProps.hooks, ...assetProps.hooks, ...promptsProps.hooks, ...policyProps.hooks } }
        },
      }, SettingsCard))), 'dsh-browser: settings page')
}
