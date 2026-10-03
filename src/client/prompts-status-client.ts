import type { SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { ClientConnectionRpc } from '@deepseek-ai/dsh-client-connection/client'
import type { PromptsStatus } from '../prompts.ts'
import { localStore } from './automation-assets-client.ts'

export interface PromptsStatusState {
  loading: boolean
  failed: boolean
  /** What the running plugin reports: the overrides in force, the diagnostics, and the L0 estimate. */
  status?: PromptsStatus
  /** The JSON of every default prompt text, once "Export default text" has loaded it (the same text `prompts:dump` prints). */
  defaults?: string
  /** Set when loading the defaults failed. */
  defaultsFailed?: boolean
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
      exportPromptDefaults: () => this.exportDefaults(),
      hidePromptDefaults: () => { const { defaults: _defaults, defaultsFailed: _failed, ...rest } = this.store.getSnapshot(); this.publish(rest) },
    }
  }

  snapshot(): PromptsStatusState { return this.store.getSnapshot() }

  dispose(): void { this.disposed = true }

  /** Load the default prompt texts as JSON, for the read-only box under the section. */
  async exportDefaults(): Promise<void> {
    try {
      const result = await this.rpc.call(CHANNEL, 'promptsDefaults', {})
      if (!result.ok) throw new Error(result.error.message)
      const { defaultsFailed: _failed, ...rest } = this.store.getSnapshot()
      this.publish({ ...rest, defaults: (result.value as { json: string }).json })
    } catch {
      this.publish({ ...this.store.getSnapshot(), defaultsFailed: true })
    }
  }

  async refresh(): Promise<void> {
    const current = this.store.getSnapshot()
    this.publish({ ...current, loading: true })
    try {
      const result = await this.rpc.call(CHANNEL, 'prompts', {})
      if (!result.ok) throw new Error(result.error.message)
      this.publish({ ...this.store.getSnapshot(), loading: false, failed: false, status: result.value as PromptsStatus })
    } catch {
      // The plugin restarts when a setting is saved; the next refresh finds it again.
      this.publish({ ...this.store.getSnapshot(), loading: false, failed: true })
    }
  }

  private publish(state: PromptsStatusState): void { if (!this.disposed) this.store.set(state) }
}
