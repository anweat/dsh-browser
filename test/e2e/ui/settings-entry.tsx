// The real SettingsCard with the REAL form controller, over a fake settings scope (window.__scope records every write the
// Host would receive), and the real status controllers over an RPC bridge into the test process (window.__rpc).
// The test sets window.__init = { locale, value, user, base, writable, accept } before the bundle runs.
import { createRoot } from 'react-dom/client'
import { useSyncExternalStore } from 'react'
import { SettingsCard } from '../../../src/client/SettingsCard.tsx'
import { BrowserSettingsController } from '../../../src/client/form.ts'
import { AutomationAssetsController } from '../../../src/client/automation-assets-client.ts'
import { PromptsStatusController } from '../../../src/client/prompts-status-client.ts'
import { PolicyStatusController } from '../../../src/client/policy-status-client.ts'
import { en, zh } from '../../../src/client/locales.ts'
import { fakeScope } from './primitives-stub.ts'

const init = (window as any).__init ?? {}
const scope = fakeScope(init)
;(window as any).__scope = scope
const rpc = {
  async call(_channel: string, endpoint: string, payload: unknown) {
    return JSON.parse(await (window as any).__rpc(endpoint, JSON.stringify(payload ?? {})))
  },
}
const assets = new AutomationAssetsController(rpc as never)
const prompts = new PromptsStatusController(rpc as never)
const policy = new PolicyStatusController(rpc as never)
const settings = new BrowserSettingsController(scope as never, () => prompts.promptDefaults())
;(window as any).__settings = settings
const injected = { ...settings.inject(), ...assets.inject(), ...prompts.inject(), ...policy.inject() }
const use = (store: { subscribe: (l: () => void) => () => void; getSnapshot: () => unknown }) => (select: (state: unknown) => unknown) => select(useSyncExternalStore(store.subscribe, store.getSnapshot))
const dictionary = (init.locale === 'zh' ? zh : en) as Record<string, string>
const props = {
  ...injected, view: 'page', t: (key: string) => dictionary[key] ?? key,
  useBrowserSettings: use(settings.inject().hooks.browserSettings as never),
  useAutomationAssets: use(assets.inject().hooks.automationAssets as never),
  usePromptsStatus: use(prompts.inject().hooks.promptsStatus as never),
  usePolicyStatus: use(policy.inject().hooks.policyStatus as never),
}
createRoot(document.getElementById('root')!).render(<SettingsCard {...(props as never)} />)
