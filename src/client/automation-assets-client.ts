import type { SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { ClientConnectionRpc } from '@deepseek-ai/dsh-client-connection/client'
import type { AutomationAsset, AutomationAssetSnapshot, AutomationAssetStatus } from '../automation-assets.ts'

export interface AutomationAssetsState {
  loading: boolean
  busy: boolean
  failed: boolean
  error?: string
  snapshot?: AutomationAssetSnapshot
  selected?: AutomationAsset
}

function localStore<T>(initial: T): SnapshotStore<T> {
  let snapshot = initial
  const listeners = new Set<() => void>()
  return {
    getSnapshot: () => snapshot,
    subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener) } },
    set(next) { snapshot = next; for (const listener of listeners) listener() },
    update(updater) { const draft = structuredClone(snapshot); updater(draft); snapshot = draft; for (const listener of listeners) listener() },
  }
}

export class AutomationAssetsController {
  private readonly store = localStore<AutomationAssetsState>({ loading: true, busy: false, failed: false })
  private disposed = false

  constructor(private readonly rpc: ClientConnectionRpc) { void this.refresh() }

  inject() {
    return {
      hooks: { automationAssets: this.store },
      refreshAutomationAssets: () => { void this.refresh() },
      selectAutomationAsset: (id?: string) => { void this.select(id) },
      saveAutomationAsset: (asset: Partial<AutomationAsset> & Pick<AutomationAsset, 'kind' | 'name'>) => this.mutate('save', { asset }),
      summarizeAutomationCandidate: (id: string) => this.mutate('summarize', { id }),
      dismissAutomationCandidate: (id: string) => this.mutate('dismiss', { id }),
      validateAutomationAsset: (id: string) => this.mutate('validate', { id }),
      testAutomationAsset: (id: string, url: string, inputs: Record<string, string>) => this.mutate('test', { id, url, inputs }),
      setAutomationAssetStatus: (id: string, status: AutomationAssetStatus) => this.mutate('status', { id, status }),
    }
  }

  snapshot(): AutomationAssetsState { return this.store.getSnapshot() }
  dispose(): void { this.disposed = true }

  async refresh(): Promise<void> {
    this.publish({ ...this.store.getSnapshot(), loading: true, failed: false, error: undefined })
    try {
      const snapshot = await this.call<AutomationAssetSnapshot>('snapshot', {})
      this.publish({ ...this.store.getSnapshot(), loading: false, snapshot })
    } catch (error) { this.fail(error) }
  }

  async select(id?: string): Promise<void> {
    if (!id) { this.publish({ ...this.store.getSnapshot(), selected: undefined }); return }
    try {
      const selected = await this.call<AutomationAsset | null>('get', { id })
      this.publish({ ...this.store.getSnapshot(), selected: selected ?? undefined, failed: false, error: undefined })
    } catch (error) { this.fail(error) }
  }

  private async mutate(endpoint: string, payload: Record<string, unknown>): Promise<void> {
    this.publish({ ...this.store.getSnapshot(), busy: true, failed: false, error: undefined })
    try {
      const value = await this.call<unknown>(endpoint, payload)
      const selected = value && typeof value === 'object' && 'id' in value ? value as AutomationAsset : this.store.getSnapshot().selected
      const snapshot = await this.call<AutomationAssetSnapshot>('snapshot', {})
      this.publish({ loading: false, busy: false, failed: false, snapshot, ...selected ? { selected } : {} })
    } catch (error) { this.fail(error) }
  }

  private async call<T>(endpoint: string, payload: unknown): Promise<T> {
    const result = await this.rpc.call('/api', `dsh-browser-assets/${endpoint}`, payload)
    if (!result.ok) throw new Error(result.error.message)
    return result.value as T
  }

  private fail(error: unknown): void {
    this.publish({ ...this.store.getSnapshot(), loading: false, busy: false, failed: true, error: String(error instanceof Error ? error.message : error).slice(0, 300) })
  }

  private publish(state: AutomationAssetsState): void { if (!this.disposed) this.store.set(state) }
}
