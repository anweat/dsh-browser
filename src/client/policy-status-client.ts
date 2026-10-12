import type { SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { ClientConnectionRpc } from '@deepseek-ai/dsh-client-connection/client'
import { localStore } from './automation-assets-client.ts'

/** The policy overlay as the plugin reports it (`inspect.policy` shape, see BrowserService.policyReport). */
export interface PolicyReportView {
  revision: number
  updatedAt?: string
  overlayActive: boolean
  warning?: string
  allowPrivateHosts: boolean
  authDir: string
  authProfiles: { id: string; origin: 'baseline' | 'overlay-changed' | 'overlay-created'; allowedDomains: string[]; persistState: boolean; storageStatePath?: string; overriddenFields?: string[] }[]
  removedByOverlay: string[]
  usagePolicy: Record<string, { value: number; baseline: number; overridden: boolean }>
  audit: { revision: number; at: string; source: 'agent' | 'panel'; session?: string; action: string; reason: string; direction: 'tighten' | 'loosen' | 'none'; changes: string[] }[]
}

export interface PolicyStatusState {
  loading: boolean
  failed: boolean
  busy?: boolean
  /** Why the last clear was refused. */
  error?: string
  report?: PolicyReportView
}

const CHANNEL = '/dsh-browser-assets'

/** Reads the policy overlay for the "policy overlay" section and clears it back to the baseline. */
export class PolicyStatusController {
  private readonly store: SnapshotStore<PolicyStatusState> = localStore<PolicyStatusState>({ loading: true, failed: false })
  private disposed = false

  constructor(private readonly rpc: ClientConnectionRpc) { void this.refresh() }

  inject() {
    return {
      hooks: { policyStatus: this.store },
      refreshPolicyStatus: () => { void this.refresh() },
      clearPolicyOverlay: (scope: 'all' | 'usagePolicy' | 'authProfile' = 'all', id?: string) => this.clear(scope, id),
    }
  }

  snapshot(): PolicyStatusState { return this.store.getSnapshot() }

  dispose(): void { this.disposed = true }

  async refresh(): Promise<void> {
    this.publish({ ...this.store.getSnapshot(), loading: true })
    try {
      const result = await this.rpc.call(CHANNEL, 'policy', {})
      if (!result.ok) throw new Error(result.error.message)
      this.publish({ ...this.store.getSnapshot(), loading: false, failed: false, report: result.value as PolicyReportView })
    } catch {
      this.publish({ ...this.store.getSnapshot(), loading: false, failed: true })
    }
  }

  async clear(scope: 'all' | 'usagePolicy' | 'authProfile', id?: string): Promise<void> {
    this.publish({ ...this.store.getSnapshot(), busy: true, error: undefined })
    try {
      const result = await this.rpc.call(CHANNEL, 'policyReset', { scope, ...id ? { id } : {}, expectedRevision: this.store.getSnapshot().report?.revision })
      if (!result.ok) throw new Error(result.error.message)
      this.publish({ ...this.store.getSnapshot(), busy: false })
    } catch (error) {
      this.publish({ ...this.store.getSnapshot(), busy: false, error: String(error instanceof Error ? error.message : error) })
    }
    await this.refresh()
  }

  private publish(state: PolicyStatusState): void { if (!this.disposed) this.store.set(state) }
}
