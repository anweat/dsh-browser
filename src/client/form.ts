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
import { fieldProblem } from './field-rules.ts'
import {
  PROPERTY_FIELDS, checkProperties, commentOutProperty, parseProperties, serializeProperties, type LineIssue, type PropertyField,
} from './properties-form.ts'
import { PROMPT_TEXT_FIELDS, canonicalPrompts, pruneDefaultExtras, type PromptDefaults, extrasText, getAt, setAt, validExtras, validPrompts, withExtras, type PromptTextFieldId } from './prompts-form.ts'

export type SectionField =
  | 'enabled' | 'automationMode' | 'toolSurface' | 'browserRuntime' | 'channel' | 'headless' | 'opencliEnabled'
  | 'autoInstall' | 'storageStatePath' | 'defaultAuthProfile'
  | 'executablePath' | 'snapshotDir' | 'verbose' | 'cdpPort' | 'maxSessions'
  | 'downloadDir' | 'downloadMaxBytes' | 'allowPrivateHosts'
  | 'viewportMode' | 'viewportWidth' | 'viewportHeight' | 'userAgent' | 'locale' | 'timezoneId' | 'proxyServer' | 'proxyBypass'

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
  /** The "default parameters" editor: one properties text over the plugin-wide default fields. */
  properties: PropertiesCardState
}

export interface PropertiesCardState {
  /** What the editor shows: what was typed (kept verbatim while it has problems), else the text printed from the fields. */
  text: string
  /** Line-level problems of the text. Errors block the save. */
  issues: LineIssue[]
  /** The keys that carry an override right now, in display order. */
  overridden: { key: string; value: string }[]
  invalid: boolean
}

export interface PromptsCardState {
  texts: Record<PromptTextFieldId, { text: string; invalid: boolean; /** The stored override is exactly the default text, so it changes nothing. */ sameAsDefault: boolean }>
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
 * A free-text field with a value rule (`field-rules.ts`, the rules the server applies): text the rule refuses is
 * invalid, which blocks the save, instead of being written and dropped at the next start.
 */
const checkedTextField = (field: SectionField): SettingsFieldSpec => {
  const base = settingsTextField(field)
  return { field, format: base.format, parse: text => text.trim() !== '' && fieldProblem(field, text) !== undefined ? undefined : base.parse(text) }
}

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

/** A JSON array of strings (Chromium launch arguments): written compactly on one line, an empty draft clears it. */
const stringArrayField = (field: string): SettingsFieldSpec => ({
  field,
  format: value => Array.isArray(value) && value.length ? JSON.stringify(value) : '',
  parse(text) {
    if (text.trim() === '') return { kind: 'clear' }
    try {
      const value = JSON.parse(text) as unknown
      return Array.isArray(value) && value.every(entry => typeof entry === 'string' && entry.length > 0) ? { kind: 'set', value } : undefined
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
  checkedTextField('downloadDir'),
  booleanField('allowPrivateHosts'),
  rangedNumberField('downloadMaxBytes', 1, 10 * 1024 * 1024 * 1024),
  enumField('viewportMode', ['window', '720p', '1080p', 'custom']),
  rangedNumberField('viewportWidth', 200, 7680),
  rangedNumberField('viewportHeight', 200, 4320),
  checkedTextField('userAgent'),
  checkedTextField('locale'),
  checkedTextField('timezoneId'),
  checkedTextField('proxyServer'),
  checkedTextField('proxyBypass'),
  booleanField('verbose'),
] as const

/** The JSON-shaped section fields: objects (policies, prompts) and the launch-argument array. */
export const JSON_FIELD_SPECS: readonly SettingsFieldSpec[] = [
  jsonField('usagePolicy', validUsagePolicy),
  jsonField('automationAssets', validAssetPolicy),
  jsonField('prompts', validPrompts),
  stringArrayField('args'),
] as const

/**
 * Public config fields the card has no form for, on purpose: nested records (named login states, rule packs with
 * hash-pinned scripts) that are safer to edit in the profile config file. The card names each one and says so, instead
 * of leaving it out without a word. `rulePacks` is not `.volatile()` in the Host schema, so no form could write it.
 */
export const CONFIG_FILE_ONLY_FIELDS = ['authProfiles', 'rulePacks'] as const

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
  /** The properties text as typed; undefined shows the text printed from the staged fields. */
  private propsRaw: string | undefined
  private propsIssues: LineIssue[] = []
  /** What was typed in each prompt control while it differs from what is staged (a text equal to the default stages nothing). */
  private readonly promptRaw: Partial<Record<PromptTextFieldId, string>> = {}

  /** `promptDefaults` reads the plugin's own prompt texts once they are loaded; until then nothing is "equal to default". */
  constructor(
    private readonly scope: SettingsFormScope<Record<string, unknown>>,
    private readonly promptDefaults: () => PromptDefaults | undefined = () => undefined,
  ) {
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
      discard: () => { this.extrasRaw = undefined; this.extrasInvalid = false; this.propsRaw = undefined; this.propsIssues = []; this.clearPromptRaw(); actions.discard() },
      editProperties: (text: string) => this.editProperties(text),
      resetProperty: (key: string) => this.resetProperty(key),
      editPromptText: (id: PromptTextFieldId, text: string) => this.editPromptText(id, text),
      setPromptSkillEnabled: (enabled: boolean) => this.setPromptSkillEnabled(enabled),
      editPromptExtras: (text: string) => this.editPromptExtras(text),
      resetPromptExtras: () => this.resetPromptExtras(),
    }
  }

  private async save(): Promise<void> {
    if (this.extrasInvalid || this.propsIssues.some(issue => issue.level === 'error')) return
    await this.form.save()
    // What was typed is now the stored value, so the box shows that again. (A failed save keeps the draft and its flag.)
    if (!this.form.shell().failed && (this.extrasRaw !== undefined || this.propsRaw !== undefined || Object.keys(this.promptRaw).length)) {
      this.extrasRaw = undefined
      this.propsRaw = undefined
      this.propsIssues = []
      this.clearPromptRaw()
      this.refresh()
    }
  }

  // --- the default parameters editor: one text over the plugin-wide default fields ------------------------------

  private spec(key: string): SettingsFieldSpec { return ALL_FIELD_SPECS.find(spec => spec.field === key)! }

  /** The text of a field as the plugin has it now (stored, deployed, or default), ignoring anything staged. */
  private storedText(key: string): string { return this.spec(key).format(this.scope.getSnapshot().value?.[key]) }

  private isStored(key: string): boolean {
    const user = this.scope.getSnapshot().user
    return user !== undefined && user !== null && Object.hasOwn(user, key)
  }

  /** Print the text from the fields as they are (staged edits included). */
  private printProperties(): string {
    return serializeProperties(PROPERTY_FIELDS.map(field => {
      const state = this.form.field(field.key)
      return { key: field.key, text: state.text, overridden: state.overridden }
    }))
  }

  /**
   * Stage the fields to match a properties text: a key with a value is edited to it, a key without one (commented,
   * deleted, blank) goes back to the default. The staged result is the same per-field `set` / `unset` the one-control
   * form produced, so the saved configuration has the same flat keys and nothing else.
   */
  editProperties(text: string): void {
    this.propsRaw = text
    const parsed = parseProperties(text)
    this.propsIssues = checkProperties(parsed, key => this.form.field(key).text)
    const actions = this.form.actions()
    for (const field of PROPERTY_FIELDS) {
      const entry = parsed.values.get(field.key)
      if (entry) actions.edit(field.key, entry.value)
      else if (this.isStored(field.key)) actions.resetField(field.key)
      else actions.edit(field.key, this.storedText(field.key))
    }
  }

  /** Comment out one key's line: that parameter goes back to the default. */
  resetProperty(key: string): void {
    const current = this.propsRaw ?? this.printProperties()
    const base = this.scope.getSnapshot().base?.[key]
    this.editProperties(commentOutProperty(current, key, this.spec(key).format(base) || (PROPERTY_FIELDS.find(field => field.key === key)?.defaultText ?? '')))
  }

  private projectProperties(): PropertiesCardState {
    const text = this.propsRaw ?? this.printProperties()
    const parsed = parseProperties(text)
    const overridden = PROPERTY_FIELDS.filter(field => parsed.values.has(field.key)).map((field: PropertyField) => ({ key: field.key, value: parsed.values.get(field.key)!.value }))
    return { text, issues: this.propsIssues, overridden, invalid: this.propsIssues.some(issue => issue.level === 'error') }
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

  private clearPromptRaw(): void { for (const key of Object.keys(this.promptRaw)) delete this.promptRaw[key as PromptTextFieldId] }

  /**
   * A prompt text: blank, or exactly the plugin's default text, is NO override. Saving the default as an override
   * would freeze today's wording and hide every later improvement, so the box keeps what was typed (an author may
   * have copied the default to edit it) while nothing is staged for it.
   */
  editPromptText(id: PromptTextFieldId, text: string): void {
    const field = PROMPT_TEXT_FIELDS.find(entry => entry.id === id)!
    const base = this.promptDefaults()?.texts[id]
    const none = text.trim() === '' || (base !== undefined && text === base)
    if (text === '' || !none) delete this.promptRaw[id]; else this.promptRaw[id] = text
    this.stagePrompts(setAt(this.promptsDraft(), field.path, none ? undefined : text))
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
        // Entries equal to the plugin's own text are not overrides (see editPromptText).
        const defaults = this.promptDefaults()?.extras
        const effective = defaults ? pruneDefaultExtras(value as Record<string, unknown>, defaults) : value as Record<string, unknown>
        this.stagePrompts(withExtras(this.promptsDraft(), effective))
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
    const properties = this.projectProperties()
    return { ...shell, invalid: shell.invalid || this.extrasInvalid || properties.invalid, fields, jsonFields, prompts: this.projectPrompts(jsonFields.prompts!), properties }
  }

  private projectPrompts(field: CardFieldState): PromptsCardState {
    const draft = this.promptsDraft()
    const texts = {} as PromptsCardState['texts']
    for (const entry of PROMPT_TEXT_FIELDS) {
      const value = getAt(draft, entry.path)
      const stored = typeof value === 'string' ? value : ''
      const text = this.promptRaw[entry.id] ?? stored
      const base = this.promptDefaults()?.texts[entry.id]
      texts[entry.id] = { text, invalid: text.length > entry.limit, sameAsDefault: stored !== '' && stored === base }
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
