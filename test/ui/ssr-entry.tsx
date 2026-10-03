// The real SettingsCard rendered to static markup, for tests that read what the card puts on the page: which config
// fields it shows, and whether every control has an accessible name. State is fed through the same props the Plugins
// page injects; nothing is mocked inside the card.
import { renderToStaticMarkup } from 'react-dom/server'
import { SettingsCard } from '../../src/client/SettingsCard.tsx'
import { en, zh } from '../../src/client/locales.ts'

const noop = () => {}
const proxy = (value: unknown) => new Proxy({}, { get: () => value })

export interface RenderOptions {
  locale?: 'en' | 'zh'
  /** The asset open in the editor, if any. */
  selected?: Record<string, unknown>
  editor?: Record<string, unknown>
  policy?: Record<string, unknown>
  prompts?: Record<string, unknown>
}

export function renderCard(options: RenderOptions = {}): { html: string; missingKeys: string[] } {
  const dictionary = (options.locale === 'zh' ? zh : en) as Record<string, string>
  const missing = new Set<string>()
  const t = (key: string) => dictionary[key] ?? (missing.add(key), key)
  const settings = {
    available: true, writable: true, saving: false, dirty: false, invalid: false, failed: false,
    fields: proxy({ text: '', invalid: false, overridden: false }), jsonFields: proxy({ text: '', invalid: false, overridden: false }),
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
  const status = { loading: false, failed: false, status: options.prompts }
  const props = {
    view: 'page', t,
    useBrowserSettings: (select: (state: unknown) => unknown) => select(settings),
    useAutomationAssets: (select: (state: unknown) => unknown) => select(assets),
    usePromptsStatus: (select: (state: unknown) => unknown) => select(status),
    edit: noop, resetField: noop, save: noop, discard: noop,
    editPromptText: noop, setPromptSkillEnabled: noop, editPromptExtras: noop, resetPromptExtras: noop, refreshPromptsStatus: noop,
    refreshAutomationAssets: noop, selectAutomationAsset: noop, saveAutomationAsset: noop, summarizeAutomationCandidate: noop, dismissAutomationCandidate: noop,
    validateAutomationAsset: noop, testAutomationAsset: noop, setAutomationAssetStatus: noop, editAutomationAsset: noop, setAssetTestUrl: noop, setAssetTestInputs: noop,
    requestSelectAutomationAsset: noop, requestNewAutomationAsset: noop, requestRefreshAutomationAssets: noop, requestForkAutomationAsset: noop, requestConvertAutomationAsset: noop,
    confirmLeaveAutomationAsset: noop, cancelLeaveAutomationAsset: noop, saveEditedAutomationAsset: noop, saveAndTestAutomationAsset: noop, activateAutomationAsset: noop,
  }
  return { html: renderToStaticMarkup(<SettingsCard {...(props as never)} />), missingKeys: [...missing] }
}
