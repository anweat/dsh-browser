import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { AutomationAssetStore, resolveAutomationAssetPolicy } from '../src/automation-assets.ts'
import { registerAutomationAssetRpc } from '../src/automation-assets-rpc.ts'
import { runRecipe, type AnyRecipeStep } from '../src/automation.ts'
import type { BrowserService } from '../src/browser-service.ts'
import { fakePage, type Behavior } from './fake-page.ts'

export const URL = 'https://example.com/search'
const shot = async (): Promise<string> => '/tmp/shot.png'

/** The real RPC handler over a real store and a service whose recipe() is the real runRecipe over a scripted page. */
export function rpcFixture(behavior: () => Behavior = () => ({})) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-browser-rpc-'))
  const store = new AutomationAssetStore(resolveAutomationAssetPolicy({ directory, persistenceMode: 'manual' }))
  /** The steps each replay actually ran, so a test can tell which content was tested. */
  const recipeRuns: AnyRecipeStep[][] = []
  const service = {
    async recipe(steps: AnyRecipeStep[], opts: Record<string, any>) {
      recipeRuns.push(structuredClone(steps))
      const { page } = fakePage(behavior())
      const run = await runRecipe(page, steps, shot, opts.signal, { legacy: opts.legacyRecipe, schemaVersion: opts.schemaVersion, postconditions: opts.postconditions, allowedDomains: opts.allowedDomains })
      return { url: URL, title: 'T', text: 'page text', ...run, steps: run.completedSteps }
    },
  } as unknown as BrowserService
  let handler: any
  const ctx: any = {
    inject(_names: unknown, setup: (ctx: unknown) => void) { setup(ctx) },
    effect(setup: () => unknown) { setup() },
    root: { connection: { rpc: { handle(_channel: string, h: unknown) { handler = h; return async () => {} } } } },
  }
  registerAutomationAssetRpc(ctx, store, service)
  const peer = { id: 'peer', ctx: {} as never, dispose: async () => {} }
  const call = (endpoint: string, payload: unknown = {}) => handler(endpoint, payload, new AbortController().signal, peer) as Promise<{ ok: boolean; value?: any; error?: { code: string; message: string; details: Record<string, any> } }>
  /** The same handler as the client sees it: `rpc.call(channel, endpoint, payload)`, with every request logged. */
  const requests: { endpoint: string; payload: any }[] = []
  const rpc = { async call(_channel: string, endpoint: string, payload: unknown) { requests.push({ endpoint, payload: structuredClone(payload) }); return call(endpoint, payload) } }
  return { store, call, rpc, requests, recipeRuns }
}

