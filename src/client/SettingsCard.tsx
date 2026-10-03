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

import { useEffect } from 'react'
import { SettingsForm, SettingsValueField } from '@deepseek-ai/dsh-client-ui-primitives'
import type { SettingsFormLabels } from '@deepseek-ai/dsh-client-ui-primitives'
import type { BrowserSettingsCardProps } from './index.ts'
import { FIELD_SPECS, JSON_FIELD_SPECS, JSON_FIELDS, type SectionField, type CardFieldState } from './form.ts'
import type { SettingsFieldSpec } from '@deepseek-ai/dsh-client-ui-primitives'
import { PROMPT_TEXT_FIELDS, type PromptTextFieldId } from './prompts-form.ts'
import { styles as css } from './styles.ts'
import { credentialView, isDirty, shortHash } from './asset-editor.ts'
import type { AssetNoticeKind } from './automation-assets-client.ts'

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
  { title: 'freedom', hint: 'freedomHint', fields: ['enabled', 'automationMode', 'toolSurface', 'opencliEnabled'] },
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
        {/* `prompts` has its own section below: several controls over one staged draft. */}
        {JSON_FIELD_SPECS.filter(spec => spec.field !== 'prompts').map(spec => field(spec))}
      </div>
      <p className={css.notice} role="note">{t('restart')}</p>
    </section>
    <PromptsPanel {...props} disabled={disabled} />
    <AutomationAssetsPanel {...props} />
  </SettingsForm>
}

/** Label and hint keys of each text control, by field id. */
const PROMPT_LABELS: Record<PromptTextFieldId, { label: LabelKey; hint: LabelKey }> = {
  indexDescription: { label: 'promptsIndexDescription', hint: 'promptsIndexDescriptionHint' },
  callDescription: { label: 'promptsCallDescription', hint: 'promptsCallDescriptionHint' },
  rootGuide: { label: 'promptsRootGuide', hint: 'promptsRootGuideHint' },
  rootNote: { label: 'promptsRootNote', hint: 'promptsRootNoteHint' },
  skillDescription: { label: 'promptsSkillDescription', hint: 'promptsSkillDescriptionHint' },
  skillBodyFile: { label: 'promptsSkillBodyFile', hint: 'promptsSkillBodyFileHint' },
  skillAppend: { label: 'promptsSkillAppend', hint: 'promptsSkillAppendHint' },
}

/**
 * The "prompt text" section: the text the model reads, overridable. The controls are views of one staged `prompts`
 * draft that saves with the rest of the form; the status block below shows what the running plugin reports about it.
 */
function PromptsPanel(props: BrowserSettingsCardProps & { disabled: boolean }) {
  const { t, disabled } = props
  const settings = props.useBrowserSettings(snapshot => snapshot)
  const status = props.usePromptsStatus(snapshot => snapshot)
  const { refreshPromptsStatus } = props
  // Refresh when the page opens and after each save settles: that is when what is in effect can have changed.
  useEffect(() => { if (!settings.saving) refreshPromptsStatus() }, [settings.saving, refreshPromptsStatus])
  const prompts = settings.prompts
  const report = status.status
  const text = (id: PromptTextFieldId) => {
    const spec = PROMPT_TEXT_FIELDS.find(entry => entry.id === id)!
    const state = prompts.texts[id]
    const labels = PROMPT_LABELS[id]
    const inputId = `plugin-config-dsh-browser-prompts-${id}`
    const common = { id: inputId, className: `${css.input} ${state.invalid ? css.invalidInput : ''}`, value: state.text, disabled, 'aria-invalid': state.invalid || undefined, onChange: (value: string) => props.editPromptText(id, value) }
    return <div key={id} className={css.field}>
      <div className={css.fieldHead}>
        <label className={css.label} htmlFor={inputId}>{t(labels.label)}</label>
        {state.text ? <button type="button" className={css.reset} disabled={disabled} onClick={() => props.editPromptText(id, '')}>{t('promptsReset')}</button> : null}
      </div>
      {spec.multiline
        ? <textarea {...common} className={`${common.className} ${css.textarea}`} rows={id === 'rootNote' ? 3 : 5} spellCheck={false} onChange={event => common.onChange(event.currentTarget.value)} />
        : <input {...common} type="text" onChange={event => common.onChange(event.currentTarget.value)} />}
      <p className={state.invalid ? css.failed : css.hint}>{state.invalid ? t('promptsTooLong') : t(labels.hint)}{spec.limit > 1024 || state.text ? ` (${state.text.length}/${spec.limit})` : ''}</p>
    </div>
  }
  const budgetLine = report ? `${t('promptsL0')}: ~${report.budget.l0Tokens} ${t('promptsTokens')} (${t('promptsBudget')} ${report.budget.l0Budget}) · ${t('promptsLargest')}: ${report.budget.largestLayer.name} ~${report.budget.largestLayer.tokens} (${t('promptsBudget')} ${report.budget.layerBudget})` : ''
  return <section className={css.section} data-dsh-browser-prompts>
    <div className={css.sectionHead}><h3>{t('prompts')}</h3><p>{t('promptsHint')}</p></div>
    <div className={css.grid}>
      {text('indexDescription')}
      {text('callDescription')}
      {text('rootGuide')}
      {text('rootNote')}
    </div>
    <div className={css.grid}>
      <div className={css.field}>
        <label className={css.toggleLabel}>
          <input type="checkbox" className={css.check} checked={prompts.skillEnabled} disabled={disabled} onChange={event => props.setPromptSkillEnabled(event.currentTarget.checked)} />
          <span><span className={css.label}>{t('promptsSkillEnabled')}</span><p className={css.hint}>{t('promptsSkillEnabledHint')}</p></span>
        </label>
      </div>
      {text('skillDescription')}
      {text('skillBodyFile')}
      {text('skillAppend')}
    </div>
    <div className={css.field}>
      <div className={css.fieldHead}>
        <label className={css.label} htmlFor="plugin-config-dsh-browser-prompts-extras">{t('promptsExtras')}</label>
        {prompts.extras.text ? <button type="button" className={css.reset} disabled={disabled} onClick={props.resetPromptExtras}>{t('promptsExtrasReset')}</button> : null}
      </div>
      <textarea id="plugin-config-dsh-browser-prompts-extras" className={`${css.input} ${css.textarea} ${css.code} ${prompts.extras.invalid ? css.invalidInput : ''}`} rows={10} spellCheck={false} disabled={disabled} aria-invalid={prompts.extras.invalid || undefined} value={prompts.extras.text} onChange={event => props.editPromptExtras(event.currentTarget.value)} />
      <p className={prompts.extras.invalid ? css.failed : css.hint} role={prompts.extras.invalid ? 'alert' : undefined}>{prompts.extras.invalid ? t('promptsExtrasInvalid') : t('promptsExtrasHint')}</p>
    </div>
    <div className={css.notice} role="status" data-dsh-browser-prompts-status>
      <strong>{t('promptsStatus')}</strong>{' '}
      <button type="button" className={css.reset} onClick={refreshPromptsStatus}>{t('promptsRefresh')}</button>
      {status.loading && !report ? <p>{t('promptsLoading')}</p> : null}
      {status.failed ? <p>{t('promptsStatusUnavailable')}</p> : null}
      {report ? <>
        <p data-dsh-browser-prompts-budget>{budgetLine}</p>
        <p>{report.overrides.length ? `${report.overrides.length} ${t('promptsOverrides')}: ${report.overrides.map(entry => entry.length === undefined ? entry.key : `${entry.key} (${entry.length})`).join(', ')}` : t('promptsNoOverrides')}</p>
        <p>{t('promptsDiagnostics')}: {report.diagnostics.length ? '' : t('promptsNoDiagnostics')}</p>
        {report.diagnostics.length ? <ul data-dsh-browser-prompts-diagnostics>{report.diagnostics.map((entry, index) => <li key={index}>{entry.message}</li>)}</ul> : null}
      </> : null}
    </div>
    <p className={css.notice} role="note">{t('promptsRestart')}</p>
  </section>
}

function AutomationAssetsPanel(props: BrowserSettingsCardProps) {
  const { t } = props
  const state = props.useAutomationAssets(snapshot => snapshot)
  const { editor, selected } = state
  const dirty = isDirty(editor.text, editor.baseline)
  const credentials = credentialView(selected)
  const draft = selected?.status === 'draft'
  // Leaving the page with edits in the textarea would lose them silently.
  useEffect(() => {
    if (!dirty) return undefined
    const guard = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', guard)
    return () => window.removeEventListener('beforeunload', guard)
  }, [dirty])

  const candidates = state.snapshot?.candidates.filter(candidate => candidate.suggestedAt && !candidate.dismissedAt) ?? []
  const assets = state.snapshot?.assets ?? []
  const noticeLabel = (kind: AssetNoticeKind) => t(({ json: 'assetNoticeJson', backend: 'assetNoticeBackend', validation: 'assetNoticeValidation', refused: 'assetNoticeRefused' } as const)[kind])
  // Unsaved edits, or a brand-new draft that was never saved: the button saves what is on screen, then tests exactly that revision.
  const saveFirst = dirty || !selected

  return <section className={css.section} data-dsh-browser-assets>
    <div className={css.sectionHead}><h3>{t('assetLibrary')}</h3><p>{t('assetLibraryHint')}</p></div>
    {state.loading ? <p className={css.notice}>{t('assetLoading')}</p> : null}
    {state.failed ? <p className={css.failed} role="alert">{state.error || t('assetFailed')}</p> : null}
    {candidates.length ? <div className={css.assetGroup}><h4>{t('assetSuggestions')}</h4>{candidates.map(candidate => <article key={candidate.id} className={css.assetRow}>
      <div><strong>{candidate.title}</strong><p>{candidate.domain} · {candidate.successfulRuns} {t('assetRuns')} · {candidate.distinctSessions} {t('assetSessions')}</p></div>
      <div className={css.actions}><button type="button" className={css.secondary} disabled={state.busy} onClick={() => props.dismissAutomationCandidate(candidate.id)}>{t('assetDismiss')}</button><button type="button" className={css.primary} disabled={state.busy} onClick={() => props.summarizeAutomationCandidate(candidate.id)}>{t('assetSummarize')}</button></div>
    </article>)}</div> : null}
    <div className={css.assetToolbar}><div><strong>{t('assetScripts')}</strong><p className={css.hint}>{t('assetScriptsHint')}</p></div><div className={css.actions}><button type="button" className={css.secondary} onClick={() => props.requestNewAutomationAsset('recipe')}>{t('assetNewRecipe')}</button><button type="button" className={css.secondary} onClick={() => props.requestNewAutomationAsset('userscript')}>{t('assetNewScript')}</button><button type="button" className={css.secondary} onClick={props.requestRefreshAutomationAssets}>{t('assetRefresh')}</button></div></div>
    {editor.confirm ? <div className={css.failed} role="alertdialog" aria-label={t('assetLeaveTitle')} data-dsh-browser-leave>
      <p>{t('assetLeaveTitle')}</p>
      <div className={css.actions}><button type="button" className={css.secondary} onClick={props.cancelLeaveAutomationAsset}>{t('assetLeaveKeep')}</button><button type="button" className={css.primary} onClick={props.confirmLeaveAutomationAsset}>{t('assetLeaveConfirm')}</button></div>
    </div> : null}
    <div className={css.assetLayout}>
      <div className={css.assetList}>{assets.length ? assets.map(asset => <button type="button" key={asset.id} className={`${css.assetItem} ${selected?.id === asset.id ? css.assetSelected : ''}`} onClick={() => props.requestSelectAutomationAsset(asset.id)}><span><strong>{asset.name}</strong><small>{asset.kind} · {asset.status} · r{asset.revision}</small></span><span className={css.assetTest}>{asset.testStatus}</span></button>) : <p className={css.hint}>{t('assetEmpty')}</p>}</div>
      <div className={css.assetEditor}>
        <label className={css.label} htmlFor="dsh-browser-asset-editor">{t('assetEditor')}{dirty ? <> · <span data-dsh-browser-dirty>{t('assetEditorDirtyBadge')}</span></> : null}</label>
        {selected ? <div className={css.hint} data-dsh-browser-version>
          <p>{t('assetRevision')} r{selected.revision} · {t('assetHash')} <code>{shortHash(selected.contentHash)}</code> · {selected.status}{selected.sourceAssetId ? <> · {t('assetDerivedFrom')} {selected.sourceAssetId.slice(0, 8)} r{selected.sourceRevision}</> : null}</p>
          {credentials.latest ? <p data-dsh-browser-credential>{t('assetLastTest')}: r{credentials.latest.revision} · <code>{shortHash(credentials.latest.contentHash)}</code> · {credentials.latest.passed ? t('assetPassed') : t('assetNotPassed')} ({credentials.latest.executionStatus}/{credentials.latest.validationStatus}, {credentials.latest.evidenceLevel}{credentials.latest.legacy ? ', legacy' : ''}) · {new Date(credentials.latest.testedAt).toLocaleString()} · {t('assetInputsDigest')} {credentials.latest.inputsDigest}{credentials.latest.revision !== selected.revision ? <> · {t('assetStaleTest')}</> : null}</p> : null}
          {selected.status === 'draft' && !credentials.vouches ? <p>{t('assetNoTest')}</p> : null}
        </div> : null}
        <textarea id="dsh-browser-asset-editor" className={`${css.input} ${css.textarea} ${css.code} ${editor.notice?.kind === 'json' ? css.invalidInput : ''}`} rows={18} value={editor.text} spellCheck={false} disabled={state.busy} placeholder={t('assetEditorHint')} onChange={event => props.editAutomationAsset(event.currentTarget.value)} />
        {editor.notice ? <p className={css.failed} role="alert" data-dsh-browser-notice={editor.notice.kind}>{noticeLabel(editor.notice.kind)}{editor.notice.message}{editor.notice.code ? ` [${editor.notice.code}]` : ''}</p> : <p className={css.hint}>{dirty ? t('assetUnsaved') : t('assetSourceBoundary')}</p>}
        {draft || !selected ? <div className={css.assetTestForm}><input className={css.input} value={editor.testUrl} placeholder={t('assetTestUrl')} onChange={event => props.setAssetTestUrl(event.currentTarget.value)} /><textarea className={`${css.input} ${css.textarea} ${css.code}`} rows={3} value={editor.testInputs} spellCheck={false} aria-label={t('assetTestInputs')} onChange={event => props.setAssetTestInputs(event.currentTarget.value)} /></div> : null}
        <div className={css.actions}>
          {selected ? <button type="button" className={css.secondary} disabled={state.busy || dirty} onClick={() => props.validateAutomationAsset(selected.id)}>{t('assetValidate')}</button> : null}
          {draft || !selected ? <button type="button" className={css.secondary} disabled={state.busy || !editor.testUrl.trim() || !editor.text} onClick={() => void props.saveAndTestAutomationAsset()}>{saveFirst ? t('assetSaveAndTest') : t('assetTest')}</button> : null}
          {draft ? <button type="button" className={css.secondary} disabled={state.busy || dirty || !credentials.vouches} title={dirty ? t('assetActivateNeedsSave') : undefined} onClick={() => void props.activateAutomationAsset()}>{t('assetActivate')} r{selected.revision}</button> : null}
          {selected && selected.status !== 'draft' ? <button type="button" className={css.secondary} disabled={state.busy} onClick={() => props.requestForkAutomationAsset(selected.id)}>{t('assetFork')}</button> : null}
          {selected && selected.status !== 'archived' ? <button type="button" className={css.secondary} disabled={state.busy} onClick={() => props.setAutomationAssetStatus(selected.id, 'archived')}>{t('assetArchive')}</button> : null}
          <button type="button" className={css.primary} disabled={state.busy || !editor.text || selected?.status === 'active'} onClick={() => void props.saveEditedAutomationAsset()}>{t('assetSaveDraft')}</button>
        </div>
      </div>
    </div>
  </section>
}
