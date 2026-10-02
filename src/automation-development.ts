/** Model-facing draft development core, independent of Harness tool transport. */

import type { AutomationAsset, AutomationAssetPolicy, AutomationAssetStore } from './automation-assets.ts'
import { convertV1ToV2Draft, type ConversionResult } from './automation-convert.ts'

export type AutomationDraftInput = Partial<AutomationAsset> & Pick<AutomationAsset, 'kind' | 'name'>

export class AutomationDevelopmentService {
  private readonly writesBySession = new Map<string, number>()

  constructor(private readonly store: AutomationAssetStore, private readonly policy: AutomationAssetPolicy) {}

  get(id: string): AutomationAsset {
    this.assertEnabled()
    const asset = this.store.get(id)
    if (!asset) throw new Error('automation asset not found')
    return asset
  }

  validate(id: string): AutomationAsset {
    this.assertEnabled()
    return this.store.validate(id)
  }

  save(input: AutomationDraftInput, sessionId: string): AutomationAsset {
    this.assertEnabled()
    const writes = this.writesBySession.get(sessionId) ?? 0
    if (writes >= this.policy.maxModelDraftWritesPerSession) throw new Error('model draft write limit reached for this session')
    const asset = this.store.saveDraft(input)
    this.writesBySession.set(sessionId, writes + 1)
    if (this.writesBySession.size > 200) this.writesBySession.delete(this.writesBySession.keys().next().value ?? '')
    return asset
  }

  /**
   * Convert a v1 recipe asset (any status) into a NEW v2 draft. The source is only read: its revision,
   * status, and content stay as they were. Counts as one draft write for the session.
   */
  convert(id: string, sessionId: string): { draft: AutomationAsset; conversion: ConversionResult } {
    this.assertEnabled()
    const source = this.store.get(id)
    if (!source) throw new Error('automation asset not found')
    const conversion = convertV1ToV2Draft(source)
    const writes = this.writesBySession.get(sessionId) ?? 0
    if (writes >= this.policy.maxModelDraftWritesPerSession) throw new Error('model draft write limit reached for this session')
    const draft = this.store.saveDraft(conversion.draft)
    this.writesBySession.set(sessionId, writes + 1)
    if (this.writesBySession.size > 200) this.writesBySession.delete(this.writesBySession.keys().next().value ?? '')
    return { draft, conversion }
  }

  private assertEnabled(): void {
    if (!this.policy.modelDevelopmentEnabled) throw new Error('model automation development is disabled')
  }
}

