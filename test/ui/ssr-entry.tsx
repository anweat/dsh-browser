// The real SettingsCard rendered to static markup, for tests that read what the card puts on the page: which config
// fields it shows, and whether every control has an accessible name. State is fed through the same props the Plugins
// page injects; nothing is mocked inside the card.
import { renderToStaticMarkup } from 'react-dom/server'
import { SettingsCard } from '../../src/client/SettingsCard.tsx'
import { en, zh } from '../../src/client/locales.ts'
import { PROPERTY_FIELDS, checkProperties, parseProperties, serializeProperties } from '../../src/client/properties-form.ts'

const noop = () => {}
const proxy = (value: unknown) => new Proxy({}, { get: () => value })

export interface RenderOptions {
  locale?: 'en' | 'zh'
  /** The asset open in the editor, if any. */
  selected?: Record<string, unknown>
  editor?: Record<string, unknown>
  policy?: Record<string, unknown>
  /** Fields merged over the policy overlay report (for example a `warning` and `overlayActive: false`). */
  policyReport?: Record<string, unknown>
  prompts?: Record<string, unknown>
  /** The exported default text, when it has been loaded. */
  promptsDefaults?: string
  /** The per-control default texts the card loads when it opens. */
  promptDefaults?: { texts: Record<string, string>; extras: Record<string, unknown> }
  /** Text each single-input field holds, by field name. */
  fieldTexts?: Record<string, string>
  /** The properties text exactly as the editor holds it (instead of printing it from fieldTexts). */
  propertiesText?: string
  /** What the running plugin reports it ignored in its configuration. */
  configWarnings?: string[]
}

export function renderCard(options: RenderOptions = {}): { html: string; missingKeys: string[] } {
  const dictionary = (options.locale === 'zh' ? zh : en) as Record<string, string>
  const missing = new Set<string>()
  const t = (key: string) => dictionary[key] ?? (missing.add(key), key)
  // The default-parameters editor, printed and checked by the card's own pure code from the texts the test gives.
  const texts = options.fieldTexts ?? {}
  const printed = options.propertiesText ?? serializeProperties(PROPERTY_FIELDS.map(field => ({ key: field.key, text: texts[field.key] ?? '', overridden: field.key in texts })))
  const parsedProps = parseProperties(printed)
  const issues = checkProperties(parsedProps, key => texts[key] ?? '')
  const properties = {
    text: printed, issues,
    overridden: PROPERTY_FIELDS.filter(field => parsedProps.values.has(field.key)).map(field => ({ key: field.key, value: parsedProps.values.get(field.key)!.value })),
    invalid: issues.some(issue => issue.level === 'error'),
  }
  const settings = {
    properties, changes: [],
    available: true, writable: true, saving: false, dirty: false, invalid: false, failed: false,
    fields: new Proxy({}, { get: (_target, name) => ({ text: options.fieldTexts?.[String(name)] ?? '', invalid: false, overridden: false }) }), jsonFields: proxy({ text: '', invalid: false, overridden: false }),
    prompts: { texts: proxy({ text: '', invalid: false }), skillEnabled: true, extras: { text: '', invalid: false }, overridden: false, invalid: false },
  }
  const assets = {
    loading: false, busy: false, failed: false,
    snapshot: {
      policy: { minInputSetsForActivation: 2, ...options.policy },
      candidates: [{ id: 'c1', domain: 'example.com', title: 'Candidate', successfulRuns: 3, failedRuns: 0, distinctSessions: 2, suggestedAt: 'x', firstSeenAt: 'x', lastSeenAt: 'x' }],
      assets: options.selected ? [{ id: options.selected.id, kind: 'recipe', status: options.selected.status, name: options.selected.name, revision: options.selected.revision, testStatus: options.selected.testStatus }] : [],
    },
    selected: options.selected,
    editor: { text: options.selected ? '{"kind":"recipe","name":"x"}' : '', baseline: options.selected ? '{"kind":"recipe","name":"x"}' : '', testUrl: '', testInputs: '{}', ...options.editor },
  }
  const status = { loading: false, failed: false, status: options.prompts, defaults: options.promptsDefaults, defaultTexts: options.promptDefaults }
  const policyState = { loading: false, failed: false, report: {
    ...options.configWarnings ? { configWarnings: options.configWarnings } : {},
    revision: 3, updatedAt: '2026-01-01T00:00:00Z', overlayActive: true, allowPrivateHosts: false, authDir: '/data/browser/auth',
    authProfiles: [{ id: 'forum', origin: 'overlay-changed', allowedDomains: ['example.com'], persistState: false }, { id: 'new', origin: 'overlay-created', allowedDomains: ['a.test'], persistState: true }],
    removedByOverlay: ['old'],
    usagePolicy: { minDelayMs: { value: 2000, baseline: 750, overridden: true } },
    audit: [{ revision: 3, at: '2026-01-01T00:00:00Z', source: 'agent', session: 'session:x', action: 'runtime.set_usage_policy', reason: 'rate limited', direction: 'tighten', changes: ['usagePolicy.minDelayMs: 750 -> 2000 (stricter)'] }],
    ...options.policyReport,
  } }
  const props = {
    view: 'page', t,
    useBrowserSettings: (select: (state: unknown) => unknown) => select(settings),
    useAutomationAssets: (select: (state: unknown) => unknown) => select(assets),
    usePromptsStatus: (select: (state: unknown) => unknown) => select(status),
    usePolicyStatus: (select: (state: unknown) => unknown) => select(policyState),
    refreshPolicyStatus: noop, clearPolicyOverlay: noop, editProperties: noop, resetProperty: noop,
    edit: noop, resetField: noop, save: noop, discard: noop,
    editPromptText: noop, setPromptSkillEnabled: noop, editPromptExtras: noop, resetPromptExtras: noop, refreshPromptsStatus: noop, exportPromptDefaults: noop, hidePromptDefaults: noop,
    refreshAutomationAssets: noop, selectAutomationAsset: noop, saveAutomationAsset: noop, summarizeAutomationCandidate: noop, dismissAutomationCandidate: noop,
    validateAutomationAsset: noop, testAutomationAsset: noop, setAutomationAssetStatus: noop, editAutomationAsset: noop, setAssetTestUrl: noop, setAssetTestInputs: noop,
    requestSelectAutomationAsset: noop, requestNewAutomationAsset: noop, requestRefreshAutomationAssets: noop, requestForkAutomationAsset: noop, requestConvertAutomationAsset: noop,
    confirmLeaveAutomationAsset: noop, cancelLeaveAutomationAsset: noop, saveEditedAutomationAsset: noop, saveAndTestAutomationAsset: noop, activateAutomationAsset: noop,
  }
  return { html: renderToStaticMarkup(<SettingsCard {...(props as never)} />), missingKeys: [...missing] }
}
