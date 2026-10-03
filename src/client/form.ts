/**
 * The browser settings card's form model.
 *
 * Staging, the revision fence, and the snapshot store are owned by the shared
 * `SettingsFormModel` from `@deepseek-ai/dsh-client-ui-primitives` — the same
 * model every official settings page uses — so this module only declares which
 * fields the card edits and how each one converts between stored value and
 * draft text. A save is one `mutate(ops, revision)`; `set`/`unset` per field no
 * longer exist on this Host line.
 * @module dsh-browser/client/form
 */

import type { SnapshotStore } from '@deepseek-ai/dsh-client-store'
import { SettingsFormModel, settingsNumberField, settingsTextField } from '@deepseek-ai/dsh-client-ui-primitives'
import type { SettingsFieldSpec, SettingsFormScope, SettingsFieldState, SettingsFormShell } from '@deepseek-ai/dsh-client-ui-primitives'
import { ASSET_POLICY_BOOLEAN_KEYS, ASSET_POLICY_ENUMS, ASSET_POLICY_INTEGER_RANGES, ASSET_POLICY_KEYS, ASSET_POLICY_STRING_KEYS, USAGE_POLICY_BOUNDS, type AssetPolicyKey } from '../policy-keys.ts'
import { PROMPT_TEXT_FIELDS, canonicalPrompts, extrasText, getAt, setAt, validExtras, validPrompts, withExtras, type PromptTextFieldId } from './prompts-form.ts'

export type SectionField =
  | 'enabled' | 'automationMode' | 'toolSurface' | 'browserRuntime' | 'channel' | 'headless' | 'opencliEnabled'
  | 'autoInstall' | 'storageStatePath' | 'defaultAuthProfile'
  | 'executablePath' | 'snapshotDir' | 'verbose' | 'cdpPort' | 'maxSessions'

/** Retained name for callers that predate the section/JSON split. */
export type SettingField = SectionField

/** One control's state, as the shared form model reports it. */
export type CardFieldState = SettingsFieldState

export interface BrowserCardState extends SettingsFormShell {
  /** Single-input controls. */
  fields: Record<SectionField, CardFieldState>
  /** JSON code-editor controls, kept apart so `fields` stays exhaustively keyed. */
  jsonFields: Record<string, CardFieldState>
  /** The "prompt text" section: views of the one staged `prompts` draft. */
  prompts: PromptsCardState
}

export interface PromptsCardState {
  texts: Record<PromptTextFieldId, { text: string; invalid: boolean }>
  skillEnabled: boolean
  /** The JSON box for groups, actions and errorHints. */
  extras: { text: string; invalid: boolean }
  /** Whether saving would leave a `prompts` entry in the user layer. */
  overridden: boolean
  /** Whether the whole `prompts` draft is one the plugin would refuse to take. */
  invalid: boolean
}

/** A free-text field that clears when emptied, so blanking the control resets it. */
const textField = (field: SectionField): SettingsFieldSpec => settingsTextField(field)

/**
 * A boolean field. The card renders a checkbox, so the conversion is explicit
 * rather than relying on the shared model's text round-trip.
 */
const booleanField = (field: SectionField): SettingsFieldSpec => ({
  field,
  format: value => value === true ? 'true' : 'false',
  parse: text => text === 'true' || text === 'false' ? { kind: 'set', value: text === 'true' } : undefined,
})

/**
 * An enumerated field. Accepts only a value on the list, so an unknown string
 * blocks the save instead of writing something the Host would reject.
 */
const enumField = (field: SectionField, values: readonly string[]): SettingsFieldSpec => ({
  field,
  format: value => typeof value === 'string' ? value : values[0] ?? '',
  parse: text => values.includes(text) ? { kind: 'set', value: text } : undefined,
})

/** A whole-number field bounded to a range; an empty draft clears it. */
const rangedNumberField = (field: SectionField, min: number, max: number): SettingsFieldSpec => {
  const base = settingsNumberField(field)
  return {
    field,
    format: base.format,
    parse(text) {
      if (text.trim() === '') return { kind: 'clear' }
      const value = Number(text)
      return Number.isInteger(value) && value >= min && value <= max ? { kind: 'set', value } : undefined
    },
  }
}

/** JSON object field: parses to a record, and an empty draft clears the field. */
const jsonField = (field: string, validate?: (value: Record<string, unknown>) => boolean): SettingsFieldSpec => ({
  field,
  format: value => value && typeof value === 'object' && !Array.isArray(value) ? JSON.stringify(value, null, 2) : '',
  parse(text) {
    if (text.trim() === '') return { kind: 'clear' }
    try {
      const value = JSON.parse(text) as unknown
      if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
      const record = value as Record<string, unknown>
      return validate && !validate(record) ? undefined : { kind: 'set', value: record }
    } catch { return undefined }
  },
})

const ASSET_KEYS: ReadonlySet<string> = new Set(ASSET_POLICY_KEYS)
const NON_NUMERIC_ASSET_KEYS: ReadonlySet<string> = new Set([...ASSET_POLICY_BOOLEAN_KEYS, ...ASSET_POLICY_STRING_KEYS, ...Object.keys(ASSET_POLICY_ENUMS)])

function validAssetPolicy(value: Record<string, unknown>): boolean {
  if (Object.keys(value).some(key => !ASSET_KEYS.has(key))) return false
  return Object.entries(value).every(([key, entry]) => {
    if (ASSET_POLICY_BOOLEAN_KEYS.includes(key as AssetPolicyKey)) return entry === undefined || typeof entry === 'boolean'
    if (ASSET_POLICY_STRING_KEYS.includes(key as AssetPolicyKey)) return entry === undefined || typeof entry === 'string'
    const choices = ASSET_POLICY_ENUMS[key as AssetPolicyKey]
    if (choices) return entry === undefined || choices.includes(String(entry))
    if (NON_NUMERIC_ASSET_KEYS.has(key)) return true
    if (typeof entry !== 'number' || !Number.isFinite(entry) || entry < 0) return false
    const range = ASSET_POLICY_INTEGER_RANGES[key as AssetPolicyKey]
    return !range || (Number.isInteger(entry) && entry >= range[0] && entry <= range[1])
  })
}

function validUsagePolicy(value: Record<string, unknown>): boolean {
  if (Object.keys(value).some(key => !(key in USAGE_POLICY_BOUNDS))) return false
  return Object.entries(USAGE_POLICY_BOUNDS).every(([key, [min, max]]) => {
    const entry = value[key]
    return entry === undefined || (typeof entry === 'number' && Number.isInteger(entry) && entry >= min && entry <= max)
  })
}

/**
 * The single-input section fields the card edits, in display order. Every entry
 * must also be `.volatile()` in the Host Config schema: `volatileForm` drops
 * unmarked fields, and the Host would refuse a write to one.
 */
export const FIELD_SPECS: readonly SettingsFieldSpec[] = [
  booleanField('enabled'),
  enumField('automationMode', ['read-only', 'standard', 'autonomous', 'unrestricted']),
  enumField('toolSurface', ['indexed', 'flat']),
  enumField('browserRuntime', ['playwright', 'patchright']),
  textField('channel'),
  rangedNumberField('cdpPort', 1, 65_535),
  rangedNumberField('maxSessions', 1, 64),
  booleanField('headless'),
  booleanField('opencliEnabled'),
  booleanField('autoInstall'),
  textField('storageStatePath'),
  textField('defaultAuthProfile'),
  textField('executablePath'),
  textField('snapshotDir'),
  booleanField('verbose'),
] as const

/** The JSON-shaped section fields the card renders as code editors. */
export const JSON_FIELD_SPECS: readonly SettingsFieldSpec[] = [
  jsonField('usagePolicy', validUsagePolicy),
  jsonField('automationAssets', validAssetPolicy),
  jsonField('prompts', validPrompts),
] as const

/** Section fields rendered as JSON code editors rather than single inputs. */
export const JSON_FIELDS: ReadonlySet<string> = new Set(JSON_FIELD_SPECS.map(spec => spec.field))

/** Every field the card renders, in display order. */
export const ALL_FIELD_SPECS: readonly SettingsFieldSpec[] = [...FIELD_SPECS, ...JSON_FIELD_SPECS]

export class BrowserSettingsController {
  private readonly form: SettingsFormModel<Record<string, unknown>>
  private readonly store: SnapshotStore<BrowserCardState>
  /** What the person typed in the groups/actions/errorHints box, kept verbatim while it is not valid JSON yet. */
  private extrasRaw: string | undefined
  private extrasInvalid = false

  constructor(private readonly scope: SettingsFormScope<Record<string, unknown>>) {
    this.form = new SettingsFormModel<Record<string, unknown>>(scope, [...ALL_FIELD_SPECS])
    this.store = this.form.bind(() => this.project())
  }

  inject() {
    const actions = this.form.actions()
    return {
      hooks: { browserSettings: this.store },
      ...actions,
      // A save is refused while the groups/actions/errorHints box holds something that is not valid.
      save: () => this.save(),
      discard: () => { this.extrasRaw = undefined; this.extrasInvalid = false; actions.discard() },
      editPromptText: (id: PromptTextFieldId, text: string) => this.editPromptText(id, text),
      setPromptSkillEnabled: (enabled: boolean) => this.setPromptSkillEnabled(enabled),
      editPromptExtras: (text: string) => this.editPromptExtras(text),
      resetPromptExtras: () => this.resetPromptExtras(),
    }
  }

  private async save(): Promise<void> {
    if (this.extrasInvalid) return
    await this.form.save()
    // What was typed is now the stored value, so the box shows that again. (A failed save keeps the draft and its flag.)
    if (!this.form.shell().failed && this.extrasRaw !== undefined) { this.extrasRaw = undefined; this.refresh() }
  }

  // --- the prompt text section: one staged `prompts` draft, several views of it ----------------------------------

  /** The staged `prompts` value as an object (empty when none, or when its text is not JSON). */
  private promptsDraft(): Record<string, unknown> {
    const text = this.form.field('prompts').text
    if (text.trim() === '') return {}
    try {
      const value = JSON.parse(text) as unknown
      return value && typeof value === 'object' && !Array.isArray(value) ? canonicalPrompts(value as Record<string, unknown>) : {}
    } catch { return {} }
  }

  private stagePrompts(value: Record<string, unknown>): void {
    const next = canonicalPrompts(value)
    const stored = this.scope.getSnapshot().value?.prompts
    const same = JSON.stringify(next) === JSON.stringify(stored && typeof stored === 'object' ? canonicalPrompts(stored as Record<string, unknown>) : {})
    // Back at the stored value: stage its own text, so the form no longer counts a change.
    const text = same ? ALL_FIELD_SPECS.find(spec => spec.field === 'prompts')!.format(stored) : Object.keys(next).length ? JSON.stringify(next, null, 2) : ''
    this.form.actions().edit('prompts', text)
  }

  private refresh(): void { this.form.actions().edit('prompts', this.form.field('prompts').text) }

  editPromptText(id: PromptTextFieldId, text: string): void {
    const field = PROMPT_TEXT_FIELDS.find(entry => entry.id === id)!
    this.stagePrompts(setAt(this.promptsDraft(), field.path, text.trim() === '' ? undefined : text))
  }

  setPromptSkillEnabled(enabled: boolean): void {
    this.stagePrompts(setAt(this.promptsDraft(), ['skill', 'enabled'], enabled ? undefined : false))
  }

  editPromptExtras(text: string): void {
    this.extrasRaw = text
    this.extrasInvalid = false
    if (text.trim() === '') { this.stagePrompts(withExtras(this.promptsDraft(), {})); return }
    try {
      const value = JSON.parse(text) as unknown
      if (value && typeof value === 'object' && !Array.isArray(value) && validExtras(value as Record<string, unknown>)) {
        this.stagePrompts(withExtras(this.promptsDraft(), value as Record<string, unknown>))
        return
      }
    } catch { /* reported below */ }
    this.extrasInvalid = true
    this.refresh()
  }

  /** Back to the plugin's own text for groups, actions and error hints. */
  resetPromptExtras(): void {
    this.extrasRaw = undefined
    this.extrasInvalid = false
    this.stagePrompts(withExtras(this.promptsDraft(), {}))
  }

  snapshot(): BrowserCardState { return this.store.getSnapshot() }

  dispose(): void { this.form.dispose() }

  private project(): BrowserCardState {
    const fields = {} as Record<SectionField, CardFieldState>
    for (const spec of FIELD_SPECS) fields[spec.field as SectionField] = this.form.field(spec.field)
    const jsonFields: Record<string, CardFieldState> = {}
    for (const spec of JSON_FIELD_SPECS) jsonFields[spec.field] = this.form.field(spec.field)
    const shell = this.form.shell()
    return { ...shell, invalid: shell.invalid || this.extrasInvalid, fields, jsonFields, prompts: this.projectPrompts(jsonFields.prompts!) }
  }

  private projectPrompts(field: CardFieldState): PromptsCardState {
    const draft = this.promptsDraft()
    const texts = {} as PromptsCardState['texts']
    for (const entry of PROMPT_TEXT_FIELDS) {
      const value = getAt(draft, entry.path)
      const text = typeof value === 'string' ? value : ''
      texts[entry.id] = { text, invalid: text.length > entry.limit }
    }
    return {
      texts,
      skillEnabled: getAt(draft, ['skill', 'enabled']) !== false,
      extras: { text: this.extrasRaw ?? extrasText(draft), invalid: this.extrasInvalid },
      overridden: field.overridden,
      invalid: field.invalid,
    }
  }
}
