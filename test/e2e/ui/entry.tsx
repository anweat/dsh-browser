// The real SettingsCard and the real AutomationAssetsController, with the Host RPC replaced by a bridge into the
// test process (window.__rpc), where the real RPC handler, asset store and BrowserService answer.
import { createRoot } from 'react-dom/client'
import { useSyncExternalStore } from 'react'
import { SettingsCard } from '../../../src/client/SettingsCard.tsx'
import { AutomationAssetsController } from '../../../src/client/automation-assets-client.ts'
import { PromptsStatusController } from '../../../src/client/prompts-status-client.ts'
import { PolicyStatusController } from '../../../src/client/policy-status-client.ts'
import { en } from '../../../src/client/locales.ts'

const rpc = {
  async call(_channel: string, endpoint: string, payload: unknown) {
    return JSON.parse(await (window as any).__rpc(endpoint, JSON.stringify(payload ?? {})))
  },
}
const controller = new AutomationAssetsController(rpc as never)
const injected = controller.inject()
const promptsController = new PromptsStatusController(rpc as never)
const promptsInjected = promptsController.inject()
const policyController = new PolicyStatusController(rpc as never)
const policyInjected = policyController.inject()
const store = injected.hooks.automationAssets
const settings = { available: true, writable: true, saving: false, dirty: false, fields: new Proxy({}, { get: () => ({ text: '', invalid: false, overridden: false }) }), jsonFields: new Proxy({}, { get: () => ({ text: '', invalid: false, overridden: false }) }), prompts: { texts: new Proxy({}, { get: () => ({ text: '', invalid: false }) }), skillEnabled: true, extras: { text: '', invalid: false }, overridden: false, invalid: false } }
const noop = () => {}
const props = {
  ...injected, ...promptsInjected, ...policyInjected, view: 'page', t: (key: string) => (en as Record<string, string>)[key] ?? key,
  useBrowserSettings: (select: (state: unknown) => unknown) => select(settings),
  useAutomationAssets: (select: (state: unknown) => unknown) => select(useSyncExternalStore(store.subscribe, store.getSnapshot)),
  edit: noop, resetField: noop, save: noop, discard: noop,
  editPromptText: noop, setPromptSkillEnabled: noop, editPromptExtras: noop, resetPromptExtras: noop,
  usePolicyStatus: (select: (state: unknown) => unknown) => select(useSyncExternalStore(policyInjected.hooks.policyStatus.subscribe, policyInjected.hooks.policyStatus.getSnapshot)),
  usePromptsStatus: (select: (state: unknown) => unknown) => select(useSyncExternalStore(promptsInjected.hooks.promptsStatus.subscribe, promptsInjected.hooks.promptsStatus.getSnapshot)),
}
createRoot(document.getElementById('root')!).render(<SettingsCard {...(props as never)} />)
