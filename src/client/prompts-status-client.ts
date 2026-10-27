import type { SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { ClientConnectionRpc } from '@deepseek-ai/dsh-client-connection/client'
import type { PromptsStatus } from '../prompts.ts'
import { localStore } from './automation-assets-client.ts'
import { defaultsFromJson, type PromptDefaults } from './prompts-form.ts'

export interface PromptsStatusState {
  loading: boolean
  failed: boolean
  /** What the running plugin reports: the overrides in force, the diagnostics, and the L0 estimate. */
  status?: PromptsStatus
  /** The JSON of every default prompt text, once "Export default text" has loaded it (the same text `prompts:dump` prints). */
  defaults?: string
  /** Set when loading the defaults failed. */
  defaultsFailed?: boolean
  /** The plugin's own text per prompt control and its default groups/actions/errorHints, loaded when the card opens. */
  defaultTexts?: PromptDefaults
  /** The default export as loaded, so "Export default text" can show it without another request. */
  defaultsJson?: string
  /** The commented YAML export, with the language it was made in. */
  defaultsYaml?: { lang: string; text: string }
  /** Set when loading the commented YAML failed. */
  yamlFailed?: boolean
}

/** Same private channel as the automation assets (see automation-assets-rpc.ts). */
const CHANNEL = '/dsh-browser-assets'

/** Reads the plugin's own account of its prompt overrides, for the "prompt text" section. */
export class PromptsStatusController {
  private readonly store: SnapshotStore<PromptsStatusState> = localStore<PromptsStatusState>({ loading: true, failed: false })
  private disposed = false

  constructor(private readonly rpc: ClientConnectionRpc) { void this.refresh(); void this.loadDefaults() }

  /** The prompt defaults the form compares with and shows as placeholders; undefined until they are loaded. */
  promptDefaults(): PromptDefaults | undefined { return this.store.getSnapshot().defaultTexts }

  inject() {
    return {
      hooks: { promptsStatus: this.store },
      refreshPromptsStatus: () => { void this.refresh() },
      exportPromptDefaults: () => this.exportDefaults(),
      exportPromptYaml: (lang: string) => this.exportYaml(lang),
      loadPromptDefaults: () => this.loadDefaults(),
      hidePromptDefaults: () => { const { defaults: _defaults, defaultsFailed: _failed, yamlFailed: _yamlFailed, ...rest } = this.store.getSnapshot(); this.publish(rest) },
    }
  }

  snapshot(): PromptsStatusState { return this.store.getSnapshot() }

  dispose(): void { this.disposed = true }

  /** Fetch the default texts (once; a later call reuses them). They feed the placeholders and the "equal to default is no override" rule. */
  async loadDefaults(): Promise<void> {
    if (this.store.getSnapshot().defaultsJson !== undefined) return
    try {
      const result = await this.rpc.call(CHANNEL, 'promptsDefaults', {})
      if (!result.ok) throw new Error(result.error.message)
      const json = (result.value as { json: string }).json
      const parsed = defaultsFromJson(json)
      const { defaultsFailed: _failed, ...rest } = this.store.getSnapshot()
      this.publish({ ...rest, defaultsJson: json, ...parsed ? { defaultTexts: parsed } : {} })
    } catch {
      this.publish({ ...this.store.getSnapshot(), defaultsFailed: true })
    }
  }

  /** Show the default text in the read-only box under the section. */
  async exportDefaults(): Promise<void> {
    await this.loadDefaults()
    const current = this.store.getSnapshot()
    if (current.defaultsJson !== undefined) this.publish({ ...current, defaults: current.defaultsJson })
  }

  /** The commented YAML of the defaults, in the card's language (fetched once per language). */
  async exportYaml(lang: string): Promise<void> {
    if (this.store.getSnapshot().defaultsYaml?.lang === lang) return
    try {
      const result = await this.rpc.call(CHANNEL, 'promptsDefaultsYaml', { lang })
      if (!result.ok) throw new Error(result.error.message)
      const { yamlFailed: _failed, ...rest } = this.store.getSnapshot()
      this.publish({ ...rest, defaultsYaml: { lang, text: (result.value as { yaml: string }).yaml } })
    } catch {
      this.publish({ ...this.store.getSnapshot(), yamlFailed: true })
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
