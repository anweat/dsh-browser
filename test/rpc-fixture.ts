import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { AutomationAssetStore, resolveAutomationAssetPolicy } from '../src/automation-assets.ts'
import { registerAutomationAssetRpc } from '../src/automation-assets-rpc.ts'
import { runRecipe, type AnyRecipeStep } from '../src/automation.ts'
import type { BrowserService } from '../src/browser-service.ts'
import { fakePage, type Behavior } from './fake-page.ts'

/**
 * A Context double with the one cordis 4.1 behaviour that matters here: the `connection` service's `rpc` getter
 * captures the Context it was read through (`owner`), and `owner.webServer` only resolves when that Context carries
 * `webServer` as an own property (what `Context.extend({ webServer })` does). Reading it through any other Context
 * throws what the Host throws on 0.2.2-rc.1.
 */
export function connectionContext(handle: (owner: any, channel: string, handler: unknown) => () => Promise<void>) {
  const base: any = {
    inject(_names: unknown, setup: (ctx: unknown) => void) { setup(base) },
    effect(setup: () => unknown) { setup() },
    get(name: string) { return name === 'webServer' ? { register() {} } : undefined },
    extend(meta: object) { const child = Object.create(this); for (const key of Reflect.ownKeys(meta)) Object.defineProperty(child, key, Object.getOwnPropertyDescriptor(meta, key)!); return child },
    get webServer(): never { throw new Error('cannot get property "webServer" without inject') },
    get connection() {
      const owner = this
      return { rpc: {
        handle(channel: string, h: unknown) { void owner.webServer; return handle(owner, channel, h) },
        // Registering on `/api` anyway would replace the shared channel's fallback and 404 every other plugin's endpoint.
        intercept() { throw new Error('must not intercept the shared /api channel') },
      } }
    },
  }
  return base
}

export const URL = 'https://example.com/search'
const shot = async (): Promise<string> => '/tmp/shot.png'

/** The real RPC handler over a real store and a service whose recipe() is the real runRecipe over a scripted page. */
export function rpcFixture(behavior: () => Behavior = () => ({}), promptsStatus?: () => unknown, runtimeStatus?: Record<string, unknown>) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-browser-rpc-'))
  const store = new AutomationAssetStore(resolveAutomationAssetPolicy({ directory, persistenceMode: 'manual' }))
  /** The steps each replay actually ran, so a test can tell which content was tested. */
  const recipeRuns: AnyRecipeStep[][] = []
  /** The options each replay was asked with (`isolated` for a fresh context). */
  const recipeOptions: Record<string, any>[] = []
  const service = {
    async status() { return runtimeStatus ?? {} },
    async recipe(steps: AnyRecipeStep[], opts: Record<string, any>) {
      recipeRuns.push(structuredClone(steps))
      recipeOptions.push({ isolated: opts.isolated, session: opts.session })
      const { page } = fakePage(behavior())
      const run = await runRecipe(page, steps, shot, opts.signal, { legacy: opts.legacyRecipe, schemaVersion: opts.schemaVersion, postconditions: opts.postconditions, allowedDomains: opts.allowedDomains })
      return { url: URL, title: 'T', text: 'page text', ...run, steps: run.completedSteps }
    },
  } as unknown as BrowserService
  let handler: any
  const ctx = connectionContext((_owner, _channel, h) => { handler = h; return async () => {} })
  registerAutomationAssetRpc(ctx, store, service, promptsStatus)
  const peer = { id: 'peer', ctx: {} as never, dispose: async () => {} }
  const call = (endpoint: string, payload: unknown = {}) => handler(endpoint, payload, new AbortController().signal, peer) as Promise<{ ok: boolean; value?: any; error?: { code: string; message: string; details: Record<string, any> } }>
  /** The same handler as the client sees it: `rpc.call(channel, endpoint, payload)`, with every request logged. */
  const requests: { endpoint: string; payload: any }[] = []
  const rpc = { async call(_channel: string, endpoint: string, payload: unknown) { requests.push({ endpoint, payload: structuredClone(payload) }); return call(endpoint, payload) } }
  return { store, call, rpc, requests, recipeRuns, recipeOptions }
}

