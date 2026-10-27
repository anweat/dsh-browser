// The real SettingsCard rendered to static markup, for tests that read what the card puts on the page: which config
// fields it shows, and whether every control has an accessible name. State is fed through the same props the Plugins
// page injects; nothing is mocked inside the card.
import { renderToStaticMarkup } from 'react-dom/server'
import { SettingsCard } from '../../src/client/SettingsCard.tsx'
import { en, zh } from '../../src/client/locales.ts'
import { BrowserSettingsController, ALL_FIELD_SPECS } from '../../src/client/form.ts'
import { fakeScope } from '../e2e/ui/primitives-stub.ts'

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
  /** Text each single-input field holds, by field name (typed text; stored as that field's own parse of it). */
  fieldTexts?: Record<string, string>
  /** Stored values by field name, as the Host's section carries them. */
  values?: Record<string, unknown>
  /** The composition layer under the stored values. */
  base?: Record<string, unknown>
  writable?: boolean
  /** The properties text exactly as the editor holds it (instead of printing it from fieldTexts). */
  propertiesText?: string
  /** What the running plugin reports it ignored in its configuration. */
  configWarnings?: string[]
  /** What the plugin's `runtime` endpoint reports (which browser would launch, whether OpenCLI is installed). */
  runtime?: Record<string, unknown>
}

export function renderCard(options: RenderOptions = {}): { html: string; missingKeys: string[] } {
  const dictionary = (options.locale === 'zh' ? zh : en) as Record<string, string>
  const missing = new Set<string>()
  const t = (key: string) => dictionary[key] ?? (missing.add(key), key)
  // The REAL form controller over a fake settings scope: the state the card reads is the one the Host page would give it.
  // `fieldTexts` are texts as a person would type them (parsed by the field's own spec); `values` are stored values as they are.
  const specs = new Map(ALL_FIELD_SPECS.map(spec => [spec.field, spec]))
  const value: Record<string, unknown> = { ...options.values }
  for (const [field, text] of Object.entries(options.fieldTexts ?? {})) {
    const write = specs.get(field)?.parse(text)
    if (write?.kind === 'set') value[field] = write.value
  }
  const controller = new BrowserSettingsController(fakeScope({ value, user: value, base: options.base ?? {}, writable: options.writable ?? true }) as never, () => options.promptDefaults as never)
  const injected = controller.inject()
  injected.setPropertyLanguage(options.locale ?? 'en')
  if (options.propertiesText !== undefined) injected.editProperties(options.propertiesText)
  const settings = controller.snapshot()
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
  const policyState = { loading: false, failed: false, ...options.runtime ? { runtime: options.runtime } : {}, report: {
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
    refreshPolicyStatus: noop, clearPolicyOverlay: noop,
    ...injected, hooks: undefined,
    refreshPromptsStatus: noop, exportPromptDefaults: noop, hidePromptDefaults: noop,
    refreshAutomationAssets: noop, selectAutomationAsset: noop, saveAutomationAsset: noop, summarizeAutomationCandidate: noop, dismissAutomationCandidate: noop,
    validateAutomationAsset: noop, testAutomationAsset: noop, setAutomationAssetStatus: noop, editAutomationAsset: noop, setAssetTestUrl: noop, setAssetTestInputs: noop,
    requestSelectAutomationAsset: noop, requestNewAutomationAsset: noop, requestRefreshAutomationAssets: noop, requestForkAutomationAsset: noop, requestConvertAutomationAsset: noop,
    confirmLeaveAutomationAsset: noop, cancelLeaveAutomationAsset: noop, saveEditedAutomationAsset: noop, saveAndTestAutomationAsset: noop, activateAutomationAsset: noop,
  }
  return { html: renderToStaticMarkup(<SettingsCard {...(props as never)} />), missingKeys: [...missing] }
}
