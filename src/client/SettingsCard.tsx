import { useState, type ReactNode } from 'react'
import type { BrowserSettingsCardProps } from './index.ts'
import type { CardFieldState, SettingField } from './form.ts'
import { styles as css } from './styles.ts'

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
      <section className={css.section}><div className={css.sectionHead}><h3>{t('runtime')}</h3><p>{t('runtimeHint')}</p></div><div className={css.grid}>{select('browserRuntime', 'browserRuntime', 'browserRuntimeHint', ['playwright', 'patchright'])}{text('channel', 'channel', 'channelHint')}{toggle('headless', 'headless', 'headlessHint')}{toggle('autoInstall', 'autoInstall', 'autoInstallHint')}{text('executablePath', 'executablePath', 'executablePathHint')}</div></section>
      <section className={css.section}><div className={css.sectionHead}><h3>{t('usage')}</h3><p>{t('usageHint')}</p></div>{json('usagePolicy', 'usagePolicy', 'usagePolicyHint', 10)}<p className={css.notice} role="note">{t('restart')}</p></section>
      <details className={css.advanced}><summary>{t('advanced')}</summary><p className={css.hint}>{t('advancedHint')}</p><div className={css.grid}>{text('storageStatePath', 'storageStatePath', 'storageStatePathHint')}{text('defaultAuthProfile', 'defaultAuthProfile', 'defaultAuthProfileHint')}{json('authProfiles', 'authProfiles', 'authProfilesHint')}{json('rulePacks', 'rulePacks', 'rulePacksHint')}{text('snapshotDir', 'snapshotDir', 'snapshotDirHint')}{toggle('verbose', 'verbose', 'verboseHint')}</div></details>
      <div className={css.footer}><p className={state.failed ? css.failed : css.status} role="status" aria-live="polite">{t(state.failed ? 'saveFailed' : state.invalid ? 'invalidSave' : state.dirty ? 'pending' : 'saved')}</p><div className={css.actions}><button type="button" className={css.secondary} disabled={!state.dirty || state.saving} onClick={props.discard}>{t('discard')}</button><button type="button" className={css.primary} disabled={!state.dirty || state.invalid || state.saving || !state.writable} onClick={props.save}>{t(state.saving ? 'saving' : 'save')}</button></div></div>
    </div> : null}
  </div>
}
