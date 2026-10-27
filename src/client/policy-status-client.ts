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
  /** Problems the running plugin found in its configuration (values that were dropped and why). */
  configWarnings?: string[]
  authProfiles: { id: string; origin: 'baseline' | 'overlay-changed' | 'overlay-created'; allowedDomains: string[]; persistState: boolean; storageStatePath?: string; overriddenFields?: string[] }[]
  removedByOverlay: string[]
  usagePolicy: Record<string, { value: number; baseline: number; overridden: boolean }>
  audit: { revision: number; at: string; source: 'agent' | 'panel'; session?: string; action: string; reason: string; direction: 'tighten' | 'loosen' | 'none'; changes: string[] }[]
}

/** What `runtime` reports: which browser would launch, and whether the optional OpenCLI is installed. */
export interface RuntimeView {
  browser: { ready: boolean; source: 'custom-executable' | 'channel' | 'playwright-chromium' | 'system-browser' | 'none'; path?: string; note?: string; installAdvice?: string }
  systemBrowsers: { channel: string; name: string; path: string }[]
  chromiumInstalled: boolean
  opencli: { enabled: boolean; installed: boolean; source?: string; hint?: string }
}

/** Only a reply of the right shape is used: an older plugin, or a bridge that answers `{}` to every endpoint, must not break the card. */
export function isRuntimeView(value: unknown): value is RuntimeView {
  const view = value as Partial<RuntimeView> | null
  return typeof view === 'object' && view !== null && typeof view.browser?.ready === 'boolean' && typeof view.opencli?.installed === 'boolean'
}

export interface PolicyStatusState {
  loading: boolean
  failed: boolean
  busy?: boolean
  /** Why the last clear was refused. */
  error?: string
  report?: PolicyReportView
  /** Absent until the first read, and when the plugin is too old to answer (the card then shows nothing about it). */
  runtime?: RuntimeView
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
      // The runtime notices come second and never hold the policy report back: a plugin build without the endpoint just has none.
      void this.refreshRuntime()
    } catch {
      this.publish({ ...this.store.getSnapshot(), loading: false, failed: true })
    }
  }

  private async refreshRuntime(): Promise<void> {
    try {
      const result = await this.rpc.call(CHANNEL, 'runtime', {})
      if (result.ok && isRuntimeView(result.value)) this.publish({ ...this.store.getSnapshot(), runtime: result.value })
    } catch { /* optional */ }
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
