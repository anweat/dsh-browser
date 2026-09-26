/**
 * The browser settings card, as the Plugins page renders it.
 *
 * The page owns the card frame — its title button, disclosure, and artwork come
 * from the slot registration — so this component renders only what goes inside:
 * the one-liner for `view: 'summary'`, and the form body for `view: 'page'`.
 * Drawing our own frame here produced a doubled card and an inner header button
 * that swallowed the platform's clicks.
 *
 * The form chrome is the shared `SettingsForm`/`SettingsValueField` pair from
 * `@deepseek-ai/dsh-client-ui-primitives`, the same components every official
 * settings page uses, so the card matches them without restating their markup.
 * @module dsh-browser/client/SettingsCard
 */

import { useEffect, useState } from 'react'
import { SettingsForm, SettingsValueField } from '@deepseek-ai/dsh-client-ui-primitives'
import type { SettingsFormLabels } from '@deepseek-ai/dsh-client-ui-primitives'
import type { BrowserSettingsCardProps } from './index.ts'
import { FIELD_SPECS, JSON_FIELD_SPECS, JSON_FIELDS, type SectionField, type CardFieldState } from './form.ts'
import type { SettingsFieldSpec } from '@deepseek-ai/dsh-client-ui-primitives'
import { styles as css } from './styles.ts'
import type { AutomationAsset } from '../automation-assets.ts'

/**
 * The page's own translator, taken from the props rather than restated: the
 * dictionary is typed, so a local `(key: string) => string` alias would reject
 * every real key.
 */
type Translator = BrowserSettingsCardProps['t']
type LabelKey = Parameters<Translator>[0]

/** The copy the shared form frame renders, from this page's dictionary. */
function formLabels(t: Translator): SettingsFormLabels {
  return {
    unavailable: t('unavailable'),
    readOnly: t('readOnly'),
    saveFailed: t('saveFailed'),
    save: t('save'),
    saving: t('saving'),
  }
}

const SECTION_LAYOUT: readonly { title: LabelKey; hint: LabelKey; fields: readonly SectionField[] }[] = [
  { title: 'freedom', hint: 'freedomHint', fields: ['enabled', 'automationMode', 'opencliEnabled'] },
  { title: 'runtime', hint: 'runtimeHint', fields: ['browserRuntime', 'channel', 'headless', 'autoInstall', 'executablePath', 'cdpPort'] },
  { title: 'advanced', hint: 'advancedHint', fields: ['storageStatePath', 'defaultAuthProfile', 'snapshotDir', 'verbose'] },
]

/** The section field a spec names, when it is one of the single-input fields. */
function sectionField(field: string): SectionField | undefined {
  return FIELD_SPECS.some(spec => spec.field === field) ? field as SectionField : undefined
}

export function SettingsCard(props: BrowserSettingsCardProps) {
  const { t } = props
  const state = props.useBrowserSettings(snapshot => snapshot)
  // The one-liner the Plugins list shows. Without it the list falls back to the
  // package's npm description, which reads like a styling bug and is not one.
  if (props.view === 'summary') return <>{t('description')}</>
  const disabled = !state.writable

  // Single-input fields live in `state.fields`; the JSON-shaped ones are read
  // from the model directly, because the card renders them as code editors
  // rather than one-line inputs.
  const numeric = new Set<string>(['cdpPort'])
  const field = (spec: SettingsFieldSpec) => {
    const known = sectionField(spec.field)
    const fieldState = known ? state.fields[known] : state.jsonFields[spec.field]
    return <SettingsValueField
      key={spec.field}
      id={`plugin-config-dsh-browser-${spec.field}`}
      label={t(spec.field as LabelKey)}
      hint={t(`${spec.field}Hint` as LabelKey)}
      overriddenLabel={t('overridden')}
      resetLabel={t('reset')}
      invalidLabel={t(JSON_FIELDS.has(spec.field) ? 'invalidJson' : 'invalidNumber')}
      numeric={numeric.has(spec.field)}
      disabled={disabled}
      {...fieldState}
      onEdit={text => props.edit(spec.field, text)}
      onReset={() => props.resetField(spec.field)}
    />
  }

  return <SettingsForm
    labels={formLabels(t)}
    state={state}
    onSave={props.save}
    onDiscard={props.discard}
  >
    {SECTION_LAYOUT.map(section => <section key={section.title} className={css.section}>
      <div className={css.sectionHead}><h3>{t(section.title)}</h3><p>{t(section.hint)}</p></div>
      <div className={css.grid}>
        {section.fields.map(name => field(FIELD_SPECS.find(spec => spec.field === name)!))}
      </div>
    </section>)}
    <section className={css.section}>
      <div className={css.sectionHead}><h3>{t('usage')}</h3><p>{t('usageHint')}</p></div>
      <div className={css.grid}>
        {JSON_FIELD_SPECS.map(spec => field(spec))}
      </div>
      <p className={css.notice} role="note">{t('restart')}</p>
    </section>
    <AutomationAssetsPanel {...props} />
  </SettingsForm>
}

function AutomationAssetsPanel(props: BrowserSettingsCardProps) {
  const { t } = props
  const state = props.useAutomationAssets(snapshot => snapshot)
  const [draft, setDraft] = useState('')
  const [draftError, setDraftError] = useState(false)
  const [testUrl, setTestUrl] = useState('')
  const [testInputs, setTestInputs] = useState('{}')
  const selected = state.selected
  useEffect(() => { if (selected) setDraft(JSON.stringify(selected, null, 2)) }, [selected?.id, selected?.revision])

  const newAsset = (kind: AutomationAsset['kind']) => {
    props.selectAutomationAsset(undefined)
    const value: Partial<AutomationAsset> & Pick<AutomationAsset, 'kind' | 'name'> = kind === 'recipe'
      ? { kind, name: 'New recipe', description: '', domains: [], tags: [], inputNames: [], recipe: [{ type: 'extract', selector: 'main', mode: 'text', limit: 20 }] }
      : { kind, name: 'New userscript', description: '', domains: [], tags: [], inputNames: [], source: '// ==UserScript==\n// @name New userscript\n// @match https://example.com/*\n// @grant none\n// ==/UserScript==\nreturn { title: document.title }' }
    setDraft(JSON.stringify(value, null, 2)); setDraftError(false)
  }
  const save = async () => {
    try {
      const value = JSON.parse(draft) as Partial<AutomationAsset> & Pick<AutomationAsset, 'kind' | 'name'>
      if (selected?.id) value.id = selected.id
      await props.saveAutomationAsset(value); setDraftError(false)
    } catch { setDraftError(true) }
  }
  const runTest = async () => {
    if (!selected || !testUrl.trim()) { setDraftError(true); return }
    try {
      const inputs = JSON.parse(testInputs) as Record<string, string>
      await props.testAutomationAsset(selected.id, testUrl.trim(), inputs); setDraftError(false)
    } catch { setDraftError(true) }
  }
  const candidates = state.snapshot?.candidates.filter(candidate => candidate.suggestedAt && !candidate.dismissedAt) ?? []
  const assets = state.snapshot?.assets ?? []

  return <section className={css.section} data-dsh-browser-assets>
    <div className={css.sectionHead}><h3>{t('assetLibrary')}</h3><p>{t('assetLibraryHint')}</p></div>
    {state.loading ? <p className={css.notice}>{t('assetLoading')}</p> : null}
    {state.failed ? <p className={css.failed} role="alert">{state.error || t('assetFailed')}</p> : null}
    {candidates.length ? <div className={css.assetGroup}><h4>{t('assetSuggestions')}</h4>{candidates.map(candidate => <article key={candidate.id} className={css.assetRow}>
      <div><strong>{candidate.title}</strong><p>{candidate.domain} · {candidate.successfulRuns} {t('assetRuns')} · {candidate.distinctSessions} {t('assetSessions')}</p></div>
      <div className={css.actions}><button type="button" className={css.secondary} disabled={state.busy} onClick={() => props.dismissAutomationCandidate(candidate.id)}>{t('assetDismiss')}</button><button type="button" className={css.primary} disabled={state.busy} onClick={() => props.summarizeAutomationCandidate(candidate.id)}>{t('assetSummarize')}</button></div>
    </article>)}</div> : null}
    <div className={css.assetToolbar}><div><strong>{t('assetScripts')}</strong><p className={css.hint}>{t('assetScriptsHint')}</p></div><div className={css.actions}><button type="button" className={css.secondary} onClick={() => newAsset('recipe')}>{t('assetNewRecipe')}</button><button type="button" className={css.secondary} onClick={() => newAsset('userscript')}>{t('assetNewScript')}</button><button type="button" className={css.secondary} onClick={props.refreshAutomationAssets}>{t('assetRefresh')}</button></div></div>
    <div className={css.assetLayout}>
      <div className={css.assetList}>{assets.length ? assets.map(asset => <button type="button" key={asset.id} className={`${css.assetItem} ${selected?.id === asset.id ? css.assetSelected : ''}`} onClick={() => props.selectAutomationAsset(asset.id)}><span><strong>{asset.name}</strong><small>{asset.kind} · {asset.status} · r{asset.revision}</small></span><span className={css.assetTest}>{asset.testStatus}</span></button>) : <p className={css.hint}>{t('assetEmpty')}</p>}</div>
      <div className={css.assetEditor}>
        <label className={css.label} htmlFor="dsh-browser-asset-editor">{t('assetEditor')}</label>
        <textarea id="dsh-browser-asset-editor" className={`${css.input} ${css.textarea} ${css.code} ${draftError ? css.invalidInput : ''}`} rows={18} value={draft} spellCheck={false} placeholder={t('assetEditorHint')} onChange={event => { setDraft(event.currentTarget.value); setDraftError(false) }} />
        <p className={css.hint}>{draftError ? t('assetInvalid') : t('assetSourceBoundary')}</p>
        {selected?.status === 'draft' ? <div className={css.assetTestForm}><input className={css.input} value={testUrl} placeholder={t('assetTestUrl')} onChange={event => setTestUrl(event.currentTarget.value)} /><textarea className={`${css.input} ${css.textarea} ${css.code}`} rows={3} value={testInputs} spellCheck={false} aria-label={t('assetTestInputs')} onChange={event => setTestInputs(event.currentTarget.value)} /></div> : null}
        <div className={css.actions}>
          {selected ? <button type="button" className={css.secondary} disabled={state.busy} onClick={() => props.validateAutomationAsset(selected.id)}>{t('assetValidate')}</button> : null}
          {selected?.status === 'draft' ? <button type="button" className={css.secondary} disabled={state.busy || !testUrl.trim()} onClick={() => void runTest()}>{t('assetTest')}</button> : null}
          {selected?.status === 'draft' ? <button type="button" className={css.secondary} disabled={state.busy || selected.testStatus !== 'passed'} onClick={() => props.setAutomationAssetStatus(selected.id, 'active')}>{t('assetActivate')}</button> : null}
          {selected && selected.status !== 'archived' ? <button type="button" className={css.secondary} disabled={state.busy} onClick={() => props.setAutomationAssetStatus(selected.id, 'archived')}>{t('assetArchive')}</button> : null}
          <button type="button" className={css.primary} disabled={state.busy || !draft || selected?.status === 'active'} onClick={() => void save()}>{t('assetSaveDraft')}</button>
        </div>
      </div>
    </div>
  </section>
}
