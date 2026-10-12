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
import { ASSET_POLICY_KEYS, USAGE_POLICY_KEYS } from '../policy-keys.ts'
import { CONFIG_FILE_ONLY_FIELDS, FIELD_SPECS, JSON_FIELDS } from './form.ts'
import { PROMPT_TEXT_FIELDS, type PromptTextFieldId } from './prompts-form.ts'
import { styles as css } from './styles.ts'
import { credentialView, identicalOutputPairs, inputSetLines, isDirty, shortHash } from './asset-editor.ts'
import { inputSetShortfall } from '../activation-rules.ts'
import type { AssetNoticeKind } from './automation-assets-client.ts'

/**
 * The page's own translator, taken from the props rather than restated: the
 * dictionary is typed, so a local `(key: string) => string` alias would reject
 * every real key.
 */
type Translator = BrowserSettingsCardProps['t']
type LabelKey = Parameters<Translator>[0]

/** Fill `{name}` placeholders of a dictionary entry. */
const fill = (text: string, values: Record<string, string | number>): string => text.replace(/\{(\w+)\}/g, (_match, key: string) => String(values[key] ?? ''))

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

/**
 * The switches and policies that stay one control each. Every plugin-wide DEFAULT (runtime, window, locale, proxy,
 * directories, limits) is a line of the default-parameters editor instead (properties-form.ts). A public config field
 * that is in neither place would be silently absent from the card; test/settings-card-render.test.ts renders the card
 * and checks every Config field is a control, a note, or a line of the properties text.
 */
const SWITCH_FIELDS: readonly string[] = ['enabled', 'automationMode', 'toolSurface', 'opencliEnabled']

/** The usage section's JSON boxes. */
const USAGE_FIELDS = ['usagePolicy', 'automationAssets'] as const

/** The keys each JSON policy box accepts, generated from the code's own lists so the hint cannot leave one out. */
const POLICY_KEY_LISTS: Readonly<Record<string, readonly string[]>> = { usagePolicy: USAGE_POLICY_KEYS, automationAssets: ASSET_POLICY_KEYS }

/** The single-input fields, where `state.fields` holds their state. */
const SINGLE_INPUT_FIELDS: ReadonlySet<string> = new Set(FIELD_SPECS.map(spec => spec.field))

export function SettingsCard(props: BrowserSettingsCardProps) {
  const { t } = props
  const state = props.useBrowserSettings(snapshot => snapshot)
  // The one-liner the Plugins list shows. Without it the list falls back to the
  // package's npm description, which reads like a styling bug and is not one.
  if (props.view === 'summary') return <>{t('description')}</>
  const disabled = !state.writable

  // The switches are single inputs (`state.fields`); the policy boxes are JSON (`state.jsonFields`).
  const field = (name: string) => {
    const fieldState = SINGLE_INPUT_FIELDS.has(name) ? state.fields[name as keyof typeof state.fields] : state.jsonFields[name]
    const policyKeys = POLICY_KEY_LISTS[name]
    return <SettingsValueField
      key={name}
      id={`plugin-config-dsh-browser-${name}`}
      label={t(name as LabelKey)}
      hint={policyKeys ? `${t(`${name}Hint` as LabelKey)} ${t('policyKeys')} ${policyKeys.join(', ')}` : t(`${name}Hint` as LabelKey)}
      overriddenLabel={t('overridden')}
      resetLabel={t('reset')}
      invalidLabel={t(JSON_FIELDS.has(name) ? 'invalidJson' : 'invalid')}
      numeric={false}
      disabled={disabled}
      {...fieldState}
      onEdit={text => props.edit(name, text)}
      onReset={() => props.resetField(name)}
    />
  }
  return <SettingsForm
    labels={formLabels(t)}
    state={state}
    onSave={props.save}
    onDiscard={props.discard}
  >
    <ConfigWarnings {...props} />
    <section className={css.section}>
      <div className={css.sectionHead}><h3>{t('freedom')}</h3><p>{t('freedomHint')}</p></div>
      <div className={css.grid}>{SWITCH_FIELDS.map(name => field(name))}</div>
    </section>
    <PropertiesPanel {...props} />
    <section className={css.section}>
      <div className={css.sectionHead}><h3>{t('usage')}</h3><p>{t('usageHint')}</p></div>
      <div className={css.grid}>
        {/* `prompts` has its own section below: several controls over one staged draft. */}
        {USAGE_FIELDS.map(name => field(name))}
      </div>
      <p className={css.notice} role="note">{t('restart')}</p>
    </section>
    <PolicyPanel {...props} />
    <PromptsPanel {...props} disabled={disabled} />
    <AutomationAssetsPanel {...props} />
  </SettingsForm>
}

/** A public field with no form: its name, what it is for, and where to edit it. */
function ConfigFileNote(props: { name: string; t: Translator }) {
  const { name, t } = props
  return <div className={css.field} data-dsh-browser-config-note={name}>
    <div className={css.fieldHead}><span className={css.label}>{t(name as LabelKey)}</span></div>
    <p className={css.hint}>{t(`${name}Hint` as LabelKey)} {t('configFileOnly')}</p>
  </div>
}

/**
 * The default parameters: one `key = value` text for every plugin-wide default (what a new context starts from).
 * Overridden keys are lines, the rest are comments showing the value in force; problems are listed with their line.
 */
function PropertiesPanel(props: BrowserSettingsCardProps) {
  const { t } = props
  const state = props.useBrowserSettings(snapshot => snapshot)
  const disabled = !state.writable
  const view = state.properties
  const errors = view.issues.filter(issue => issue.level === 'error')
  const warnings = view.issues.filter(issue => issue.level === 'warning')
  const id = 'plugin-config-dsh-browser-properties'
  return <section className={css.section} data-dsh-browser-properties>
    <div className={css.sectionHead}><h3>{t('properties')}</h3><p>{t('propertiesHint')}</p></div>
    <div className={css.field}>
      <div className={css.fieldHead}><label className={css.label} htmlFor={id}>{t('propertiesEditor')}</label></div>
      <textarea id={id} className={`${css.input} ${css.textarea} ${css.code} ${errors.length ? css.invalidInput : ''}`} rows={30} spellCheck={false}
        disabled={disabled} aria-invalid={errors.length > 0 || undefined} value={view.text} onChange={event => props.editProperties(event.currentTarget.value)} />
      {errors.length ? <ul className={css.failed} role="alert" data-dsh-browser-properties-errors>{errors.map((issue, index) => <li key={index}>{issue.message}</li>)}</ul> : null}
      {warnings.length ? <ul className={css.hint} data-dsh-browser-properties-warnings>{warnings.map((issue, index) => <li key={index}>{issue.message}</li>)}</ul> : null}
      <p className={css.hint}>{t('propertiesFormat')}</p>
    </div>
    <div className={css.field} data-dsh-browser-properties-overridden>
      <div className={css.fieldHead}><span className={css.label}>{t('propertiesOverridden')}</span></div>
      {view.overridden.length
        ? <ul>{view.overridden.map(entry => <li key={entry.key}><code>{entry.key} = {entry.value}</code> <span className={css.hint}>[{t('overridden')}]</span> <button type="button" className={css.reset} disabled={disabled} onClick={() => props.resetProperty(entry.key)}>{t('reset')}</button></li>)}</ul>
        : <p className={css.hint}>{t('propertiesNoneOverridden')}</p>}
    </div>
    <div className={css.grid}>{CONFIG_FILE_ONLY_FIELDS.map(name => <ConfigFileNote key={name} name={name} t={t} />)}</div>
    <p className={css.notice} role="note">{t('restart')}</p>
  </section>
}

/** Problems the running plugin found in its configuration: values it dropped, and why. Shown above the form. */
function ConfigWarnings(props: BrowserSettingsCardProps) {
  const { t } = props
  const warnings = props.usePolicyStatus(snapshot => snapshot.report?.configWarnings)
  if (!warnings?.length) return null
  return <div className={css.failed} role="alert" data-dsh-browser-config-warnings>
    <strong>{t('configWarnings')}</strong>
    <ul>{warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul>
  </div>
}

/**
 * The policy overlay: what agents changed on top of the configured auth profiles and usage limits, with the audit
 * trail and the way back to the baseline. Read-only except for the clear buttons.
 */
function PolicyPanel(props: BrowserSettingsCardProps) {
  const { t } = props
  const state = props.usePolicyStatus(snapshot => snapshot)
  const { refreshPolicyStatus } = props
  const settings = props.useBrowserSettings(snapshot => snapshot)
  useEffect(() => { if (!settings.saving) refreshPolicyStatus() }, [settings.saving, refreshPolicyStatus])
  const report = state.report
  const origin = (value: 'baseline' | 'overlay-changed' | 'overlay-created') => t(({ baseline: 'policyOriginBaseline', 'overlay-changed': 'policyOriginChanged', 'overlay-created': 'policyOriginCreated' } as const)[value])
  const direction = (value: 'tighten' | 'loosen' | 'none') => t(({ tighten: 'policyTightened', loosen: 'policyLoosened', none: 'policyUnchanged' } as const)[value])
  const usage = report ? Object.entries(report.usagePolicy) : []
  return <section className={css.section} data-dsh-browser-policy>
    <div className={css.sectionHead}><h3>{t('policyOverlay')}</h3><p>{t('policyOverlayHint')}</p></div>
    <div className={css.notice} role="status">
      <button type="button" className={css.reset} onClick={refreshPolicyStatus}>{t('promptsRefresh')}</button>
      {state.loading && !report ? <p>{t('promptsLoading')}</p> : null}
      {state.failed ? <p>{t('policyUnavailable')}</p> : null}
      {report ? <>
        <p data-dsh-browser-policy-revision>{t('policyRevision')} {report.revision}{report.updatedAt ? ` · ${new Date(report.updatedAt).toLocaleString()}` : ''} · {report.overlayActive ? t('policyActive') : t('policyInactive')}</p>
        {report.warning ? <p className={css.failed} role="alert" data-dsh-browser-policy-warning>{report.warning}</p> : null}
        <p className={css.hint}>{t('policyAuthDir')}: <code>{report.authDir}</code> · allowPrivateHosts: {String(report.allowPrivateHosts)}</p>
        <h4>{t('policyProfiles')}</h4>
        {report.authProfiles.length ? <ul data-dsh-browser-policy-profiles>{report.authProfiles.map(profile => <li key={profile.id} data-dsh-browser-policy-origin={profile.origin}>
          <strong>{profile.id}</strong> <span className={css.hint}>[{origin(profile.origin)}]</span> {profile.allowedDomains.join(', ')} · persistState={String(profile.persistState)}
          {profile.origin !== 'baseline' ? <> <button type="button" className={css.reset} disabled={state.busy} onClick={() => void props.clearPolicyOverlay('authProfile', profile.id)}>{t('policyRevert')}</button></> : null}
        </li>)}</ul> : <p className={css.hint}>{t('policyNoProfiles')}</p>}
        {report.removedByOverlay.length ? <p data-dsh-browser-policy-removed>{t('policyRemoved')}: {report.removedByOverlay.join(', ')}</p> : null}
        <h4>{t('policyUsage')}</h4>
        <ul data-dsh-browser-policy-usage>{usage.map(([key, entry]) => <li key={key} data-dsh-browser-policy-overridden={entry.overridden ? 'true' : 'false'}>
          {key}: {entry.value}{entry.overridden ? <> <span className={css.hint}>[{t('policyOriginChanged')}; {t('policyBaselineWas')} {entry.baseline}]</span></> : null}
        </li>)}</ul>
        <h4>{t('policyAudit')}</h4>
        {report.audit.length ? <ul data-dsh-browser-policy-audit>{[...report.audit].reverse().map(entry => <li key={entry.revision}>
          r{entry.revision} · {new Date(entry.at).toLocaleString()} · {entry.source}{entry.session ? ` ${entry.session}` : ''} · {entry.action} · <em>{direction(entry.direction)}</em> · {entry.reason}
          {entry.changes.length ? <small> — {entry.changes.join('; ')}</small> : null}
        </li>)}</ul> : <p className={css.hint}>{t('policyNoAudit')}</p>}
        {state.error ? <p className={css.failed} role="alert">{state.error}</p> : null}
        <div className={css.actions}>
          <button type="button" className={css.secondary} disabled={state.busy || (!report.overlayActive && !report.warning)} onClick={() => void props.clearPolicyOverlay('all')} data-dsh-browser-policy-clear>{t('policyClear')}</button>
        </div>
        <p className={css.hint}>{t('policyUnrestrictedNote')}</p>
      </> : null}
    </div>
  </section>
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
    <div className={css.field} data-dsh-browser-prompts-export>
      <div className={css.fieldHead}>
        <span className={css.label}>{t('promptsDefaults')}</span>
        {status.defaults === undefined
          ? <button type="button" className={css.secondary} onClick={() => void props.exportPromptDefaults()}>{t('promptsExport')}</button>
          : <span className={css.actions}>
            <button type="button" className={css.secondary} onClick={() => { void navigator.clipboard?.writeText(status.defaults ?? '').catch(() => undefined) }}>{t('promptsCopy')}</button>
            <button type="button" className={css.secondary} onClick={props.hidePromptDefaults}>{t('promptsHideDefaults')}</button>
          </span>}
      </div>
      {status.defaults !== undefined
        ? <textarea className={`${css.input} ${css.textarea} ${css.code}`} rows={12} readOnly spellCheck={false} aria-label={t('promptsDefaults')} value={status.defaults} onFocus={event => event.currentTarget.select()} data-dsh-browser-prompts-defaults />
        : null}
      {status.defaultsFailed ? <p className={css.failed} role="alert">{t('promptsDefaultsFailed')}</p> : <p className={css.hint}>{t('promptsDefaultsHint')}</p>}
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
  const latest = credentials.latest
  const sets = latest?.revision === selected?.revision ? inputSetLines(latest) : []
  const suspect = latest && sets.length ? identicalOutputPairs(latest) : []
  const required = state.snapshot?.policy.minInputSetsForActivation ?? 1
  // A passed test that is too narrow: activation would be refused, and this says why before the click.
  const shortfall = selected && draft && credentials.vouches ? inputSetShortfall(selected, credentials.current, required) : undefined
  const shortfallText = shortfall ? fill(t('assetNeedsInputSets'), { required: shortfall.required, covered: shortfall.covered }) : ''
  const convertible = !!selected && selected.kind === 'recipe' && (selected.schemaVersion ?? 1) === 1

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
          {sets.length ? <div data-dsh-browser-sets>
            <p>{t('assetInputSets')}{latest?.plannedSets && latest.plannedSets > sets.length ? ` (${t('assetSetsRan')} ${sets.length}/${latest.plannedSets})` : ''}</p>
            <ul>{sets.map(line => <li key={line.set} data-dsh-browser-set={line.set}>{t('assetInputSet')} {line.set} {t('assetInputSetUnit')} · {line.passed ? t('assetPassed') : t('assetNotPassed')} ({line.status}) · {t('assetInputsDigest')} <code>{line.inputsDigest}</code></li>)}</ul>
          </div> : null}
          {suspect.length ? <p className={css.failed} role="note" data-dsh-browser-suspect>{fill(t('assetSuspect'), { pairs: suspect.map(pair => pair.join('/')).join('; ') })}</p> : null}
          {selected.pendingDisambiguation?.length ? <p data-dsh-browser-pending>{fill(t('assetPending'), { n: selected.pendingDisambiguation.length })}</p> : null}
        </div> : null}
        {editor.converted ? <div className={css.notice} role="status" data-dsh-browser-converted>
          <p>{fill(t('assetConverted'), { name: editor.converted.sourceName })}</p>
          <ul>{editor.converted.notes.map((note, index) => <li key={index}>{note}</li>)}</ul>
        </div> : null}
        <textarea id="dsh-browser-asset-editor" aria-label={t('assetEditor')} className={`${css.input} ${css.textarea} ${css.code} ${editor.notice?.kind === 'json' ? css.invalidInput : ''}`} rows={18} value={editor.text} spellCheck={false} disabled={state.busy} placeholder={t('assetEditorHint')} onChange={event => props.editAutomationAsset(event.currentTarget.value)} />
        {editor.notice ? <p className={css.failed} role="alert" data-dsh-browser-notice={editor.notice.kind}>{noticeLabel(editor.notice.kind)}{editor.notice.message}{editor.notice.code ? ` [${editor.notice.code}]` : ''}</p> : <p className={css.hint}>{dirty ? t('assetUnsaved') : t('assetSourceBoundary')}</p>}
        {draft || !selected ? <div className={css.assetTestForm}><input className={css.input} value={editor.testUrl} aria-label={t('assetTestUrl')} placeholder={t('assetTestUrl')} onChange={event => props.setAssetTestUrl(event.currentTarget.value)} /><textarea className={`${css.input} ${css.textarea} ${css.code}`} rows={3} value={editor.testInputs} spellCheck={false} aria-label={t('assetTestInputs')} onChange={event => props.setAssetTestInputs(event.currentTarget.value)} /></div> : null}
        {shortfall ? <p className={css.hint} role="note" data-dsh-browser-activation-hint>{shortfallText}</p> : null}
        <div className={css.actions}>
          {selected ? <button type="button" className={css.secondary} disabled={state.busy || dirty} onClick={() => props.validateAutomationAsset(selected.id)}>{t('assetValidate')}</button> : null}
          {draft || !selected ? <button type="button" className={css.secondary} disabled={state.busy || !editor.testUrl.trim() || !editor.text} onClick={() => void props.saveAndTestAutomationAsset()}>{saveFirst ? t('assetSaveAndTest') : t('assetTest')}</button> : null}
          {draft ? <button type="button" className={css.secondary} disabled={state.busy || dirty || !credentials.vouches || !!shortfall} title={dirty ? t('assetActivateNeedsSave') : shortfallText || undefined} onClick={() => void props.activateAutomationAsset()}>{t('assetActivate')} r{selected.revision}</button> : null}
          {convertible ? <button type="button" className={css.secondary} disabled={state.busy} onClick={() => props.requestConvertAutomationAsset(selected.id)}>{t('assetConvert')}</button> : null}
          {selected && selected.status !== 'draft' ? <button type="button" className={css.secondary} disabled={state.busy} onClick={() => props.requestForkAutomationAsset(selected.id)}>{t('assetFork')}</button> : null}
          {selected && selected.status !== 'archived' ? <button type="button" className={css.secondary} disabled={state.busy} onClick={() => props.setAutomationAssetStatus(selected.id, 'archived')}>{t('assetArchive')}</button> : null}
          <button type="button" className={css.primary} disabled={state.busy || !editor.text || selected?.status === 'active'} onClick={() => void props.saveEditedAutomationAsset()}>{t('assetSaveDraft')}</button>
        </div>
      </div>
    </div>
  </section>
}
