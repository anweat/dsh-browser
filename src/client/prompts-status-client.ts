import type { SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { ClientConnectionRpc } from '@deepseek-ai/dsh-client-connection/client'
import type { PromptsStatus } from '../prompts.ts'
import { localStore } from './automation-assets-client.ts'

export interface PromptsStatusState {
  loading: boolean
  failed: boolean
  /** What the running plugin reports: the overrides in force, the diagnostics, and the L0 estimate. */
  status?: PromptsStatus
}

/** Same private channel as the automation assets (see automation-assets-rpc.ts). */
const CHANNEL = '/dsh-browser-assets'

/** Reads the plugin's own account of its prompt overrides, for the "prompt text" section. */
export class PromptsStatusController {
  private readonly store: SnapshotStore<PromptsStatusState> = localStore<PromptsStatusState>({ loading: true, failed: false })
  private disposed = false

  constructor(private readonly rpc: ClientConnectionRpc) { void this.refresh() }

  inject() {
    return {
      hooks: { promptsStatus: this.store },
      refreshPromptsStatus: () => { void this.refresh() },
    }
  }

  snapshot(): PromptsStatusState { return this.store.getSnapshot() }

  dispose(): void { this.disposed = true }

  async refresh(): Promise<void> {
    const current = this.store.getSnapshot()
    this.publish({ ...current, loading: true })
    try {
      const result = await this.rpc.call(CHANNEL, 'prompts', {})
      if (!result.ok) throw new Error(result.error.message)
      this.publish({ loading: false, failed: false, status: result.value as PromptsStatus })
    } catch {
      // The plugin restarts when a setting is saved; the next refresh finds it again.
      this.publish({ ...this.store.getSnapshot(), loading: false, failed: true })
    }
  }

  private publish(state: PromptsStatusState): void { if (!this.disposed) this.store.set(state) }
}
