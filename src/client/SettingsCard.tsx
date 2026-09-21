import { useEffect, useState, type ReactNode } from 'react'
import type { BrowserSettingsCardProps } from './index.ts'
import type { CardFieldState, SettingField } from './form.ts'
import { styles as css } from './styles.ts'
import type { AutomationAsset } from '../automation-assets.ts'

function FieldShell(props: { field: SettingField; state: CardFieldState; label: string; hint: string; disabled: boolean; resetLabel: string; onReset: (field: SettingField) => void; children: ReactNode }) {
  const id = `dsh-browser-${props.field}`
  return <div className={`${css.field} ${props.state.invalid ? css.invalid : ''}`}>
    <div className={css.fieldHead}><label className={css.label} htmlFor={id}>{props.label}</label>{props.state.overridden ? <button type="button" className={css.reset} disabled={props.disabled} onClick={() => props.onReset(props.field)}>{props.resetLabel}</button> : null}</div>
    {props.children}
    <p className={css.hint}>{props.hint}</p>
  </div>
}

export function SettingsCard(props: BrowserSettingsCardProps) {
  const { t } = props
  const state = props.useBrowserSettings(snapshot => snapshot)
  const [open, setOpen] = useState(false)
  if (!state.available) return null
  const disabled = !state.writable || state.saving
  const text = (field: SettingField, label: Parameters<typeof t>[0], hint: Parameters<typeof t>[0]) => <FieldShell field={field} state={state.fields[field]} label={t(label)} hint={state.fields[field].invalid ? t('invalid') : t(hint)} disabled={disabled} resetLabel={t('reset')} onReset={props.resetField}><input id={`dsh-browser-${field}`} className={css.input} value={state.fields[field].text} disabled={disabled} aria-invalid={state.fields[field].invalid || undefined} onChange={event => props.edit(field, event.currentTarget.value)} /></FieldShell>
  const select = (field: SettingField, label: Parameters<typeof t>[0], hint: Parameters<typeof t>[0], options: string[]) => <FieldShell field={field} state={state.fields[field]} label={t(label)} hint={state.fields[field].invalid ? t('invalid') : t(hint)} disabled={disabled} resetLabel={t('reset')} onReset={props.resetField}><select id={`dsh-browser-${field}`} className={css.input} value={state.fields[field].text} disabled={disabled} onChange={event => props.edit(field, event.currentTarget.value)}>{options.map(option => <option key={option} value={option}>{option}</option>)}</select></FieldShell>
  const json = (field: SettingField, label: Parameters<typeof t>[0], hint: Parameters<typeof t>[0], rows = 7) => <FieldShell field={field} state={state.fields[field]} label={t(label)} hint={state.fields[field].invalid ? t('invalidJson') : t(hint)} disabled={disabled} resetLabel={t('reset')} onReset={props.resetField}><textarea id={`dsh-browser-${field}`} className={`${css.input} ${css.textarea} ${css.code}`} rows={rows} value={state.fields[field].text} disabled={disabled} spellCheck={false} aria-invalid={state.fields[field].invalid || undefined} onChange={event => props.edit(field, event.currentTarget.value)} /></FieldShell>
  const toggle = (field: SettingField, label: Parameters<typeof t>[0], hint: Parameters<typeof t>[0]) => <div className={css.toggle}><label className={css.toggleLabel}><input className={css.check} type="checkbox" checked={state.fields[field].text === 'true'} disabled={disabled} onChange={event => props.edit(field, String(event.currentTarget.checked))} /><span><span className={css.label}>{t(label)}</span><p className={css.hint}>{t(hint)}</p></span></label>{state.fields[field].overridden ? <button type="button" className={css.reset} disabled={disabled} onClick={() => props.resetField(field)}>{t('reset')}</button> : null}</div>

  return <div className={`${css.card} ${open ? css.open : ''}`} data-dsh-browser-settings>
    <button type="button" className={css.header} aria-expanded={open} aria-label={`${t(open ? 'collapse' : 'expand')}: ${t('title')}`} onClick={() => setOpen(!open)}><span className={css.head}><span className={css.titleRow}><span className={css.name}>{t('title')}</span>{state.dirty ? <span className={css.badge}>{t('unsaved')}</span> : null}</span><span className={css.description}>{t('description')}</span></span><svg className={`${css.chevron} ${open ? css.chevronOpen : ''}`} viewBox="0 0 14 14" width="14" height="14" aria-hidden="true"><path d="M3.5 5.5 7 9l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" /></svg></button>
    {open ? <div className={css.body}>
      {!state.writable ? <p className={css.notice} role="status">{t('readOnly')}</p> : null}
      <section className={css.section}><div className={css.sectionHead}><h3>{t('freedom')}</h3><p>{t('freedomHint')}</p></div><div className={css.grid}>{toggle('enabled', 'enabled', 'enabledHint')}{select('automationMode', 'automationMode', 'automationModeHint', ['read-only', 'standard', 'autonomous', 'unrestricted'])}{toggle('opencliEnabled', 'opencliEnabled', 'opencliEnabledHint')}</div></section>
      <section className={css.section}><div className={css.sectionHead}><h3>{t('runtime')}</h3><p>{t('runtimeHint')}</p></div><div className={css.grid}>{select('browserRuntime', 'browserRuntime', 'browserRuntimeHint', ['playwright', 'patchright'])}{text('channel', 'channel', 'channelHint')}{toggle('headless', 'headless', 'headlessHint')}{toggle('autoInstall', 'autoInstall', 'autoInstallHint')}{text('executablePath', 'executablePath', 'executablePathHint')}{text('cdpPort', 'cdpPort', 'cdpPortHint')}{json('args', 'args', 'argsHint', 5)}</div></section>
      <section className={css.section}><div className={css.sectionHead}><h3>{t('usage')}</h3><p>{t('usageHint')}</p></div><div className={css.grid}>{json('usagePolicy', 'usagePolicy', 'usagePolicyHint', 10)}{json('automationAssets', 'automationAssets', 'automationAssetsHint', 14)}</div><p className={css.notice} role="note">{t('restart')}</p></section>
      <AutomationAssetsPanel {...props} />
      <details className={css.advanced}><summary>{t('advanced')}</summary><p className={css.hint}>{t('advancedHint')}</p><div className={css.grid}>{text('storageStatePath', 'storageStatePath', 'storageStatePathHint')}{text('defaultAuthProfile', 'defaultAuthProfile', 'defaultAuthProfileHint')}{json('authProfiles', 'authProfiles', 'authProfilesHint')}{json('rulePacks', 'rulePacks', 'rulePacksHint')}{text('snapshotDir', 'snapshotDir', 'snapshotDirHint')}{toggle('verbose', 'verbose', 'verboseHint')}</div></details>
      <div className={css.footer}><p className={state.failed ? css.failed : css.status} role="status" aria-live="polite">{t(state.failed ? 'saveFailed' : state.invalid ? 'invalidSave' : state.dirty ? 'pending' : 'saved')}</p><div className={css.actions}><button type="button" className={css.secondary} disabled={!state.dirty || state.saving} onClick={props.discard}>{t('discard')}</button><button type="button" className={css.primary} disabled={!state.dirty || state.invalid || state.saving || !state.writable} onClick={props.save}>{t(state.saving ? 'saving' : 'save')}</button></div></div>
    </div> : null}
  </div>
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
