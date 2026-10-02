// The real SettingsCard and the real AutomationAssetsController, with the Host RPC replaced by a bridge into the
// test process (window.__rpc), where the real RPC handler, asset store and BrowserService answer.
import { createRoot } from 'react-dom/client'
import { useSyncExternalStore } from 'react'
import { SettingsCard } from '../../../src/client/SettingsCard.tsx'
import { AutomationAssetsController } from '../../../src/client/automation-assets-client.ts'
import { en } from '../../../src/client/locales.ts'

const rpc = {
  async call(_channel: string, endpoint: string, payload: unknown) {
    return JSON.parse(await (window as any).__rpc(endpoint, JSON.stringify(payload ?? {})))
  },
}
const controller = new AutomationAssetsController(rpc as never)
const injected = controller.inject()
const store = injected.hooks.automationAssets
const settings = { available: true, writable: true, saving: false, dirty: false, fields: new Proxy({}, { get: () => ({ text: '', invalid: false, overridden: false }) }), jsonFields: new Proxy({}, { get: () => ({ text: '', invalid: false, overridden: false }) }) }
const noop = () => {}
const props = {
  ...injected, view: 'page', t: (key: string) => (en as Record<string, string>)[key] ?? key,
  useBrowserSettings: (select: (state: unknown) => unknown) => select(settings),
  useAutomationAssets: (select: (state: unknown) => unknown) => select(useSyncExternalStore(store.subscribe, store.getSnapshot)),
  edit: noop, resetField: noop, save: noop, discard: noop,
}
createRoot(document.getElementById('root')!).render(<SettingsCard {...(props as never)} />)
