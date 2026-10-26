/**
 * "Prompts": the text the model reads, as a list. A row per text (name, default or overridden, length) and an Edit
 * dialog that puts the default text beside your override; the per-entry overrides (groups, actions, error hints) are a
 * list of only the entries you changed, with their own dialog. The budget summary stays on top and the default text can be
 * exported, as commented YAML or plain JSON.
 *
 * Every edit stages into the one `prompts` draft the page's Save writes (see form.ts); a dialog's own Save only stages.
 * @module dsh-browser/client/group-prompts
 */

import { useEffect, useState } from 'react'
import { SegmentedControl } from '@deepseek-ai/dsh-client-ui-primitives'
import { PROMPT_LIMITS } from '../prompt-limits.ts'
import { fill, rowLabels, type Card, type LabelKey } from './field-rows.tsx'
import { PROMPT_EXTRA_KEYS, PROMPT_TEXT_FIELDS, type PromptExtraEntry, type PromptExtraKind, type PromptTextFieldId } from './prompts-form.ts'
import { styles as css } from './styles.ts'
import { Badge, Btn, Dialog, Fold, Group, Item, Row, Select, SubHead, TextInput, Toggle } from './ui-kit.tsx'

/** Label and hint keys of each text, by id. */
const TEXT_LABELS: Record<PromptTextFieldId, { label: LabelKey; hint: LabelKey }> = {
  indexDescription: { label: 'promptsIndexDescription', hint: 'promptsIndexDescriptionHint' },
  callDescription: { label: 'promptsCallDescription', hint: 'promptsCallDescriptionHint' },
  rootGuide: { label: 'promptsRootGuide', hint: 'promptsRootGuideHint' },
  rootNote: { label: 'promptsRootNote', hint: 'promptsRootNoteHint' },
  skillDescription: { label: 'promptsSkillDescription', hint: 'promptsSkillDescriptionHint' },
  skillBodyFile: { label: 'promptsSkillBodyFile', hint: 'promptsSkillBodyFileHint' },
  skillAppend: { label: 'promptsSkillAppend', hint: 'promptsSkillAppendHint' },
}

const KIND_LABELS: Record<PromptExtraKind, LabelKey> = { groups: 'promptKindGroups', actions: 'promptKindActions', errorHints: 'promptKindErrorHints' }

function usePrompts(card: Card) {
  const state = card.useBrowserSettings(snapshot => snapshot.prompts)
  const disabled = card.useBrowserSettings(snapshot => !snapshot.writable)
  const status = card.usePromptsStatus(snapshot => snapshot)
  return { state, disabled, status, defaults: status.defaultTexts }
}

/** The budget line and the diagnostics, from what the running plugin reports. */
function StatusLine({ card }: { card: Card }) {
  const { t } = card
  const { status, state } = usePrompts(card)
  const { refreshPromptsStatus } = card
  const saving = card.useBrowserSettings(snapshot => snapshot.saving)
  // Refresh when the group renders and after each save settles: that is when what is in effect can have changed.
  useRefreshAfterSave(saving, refreshPromptsStatus)
  const report = status.status
  const count = report?.overrides.length ?? 0
  return <div className={css.item} role="status" data-dsh-browser-prompts-status>
    <div className={css.itemMain}>
      <div className={css.itemTitle} data-dsh-browser-prompts-budget>
        {report ? fill(t('promptsStatusLine'), { l0: report.budget.l0Tokens, l0Budget: report.budget.l0Budget, layer: report.budget.largestLayer.name, tokens: report.budget.largestLayer.tokens, layerBudget: report.budget.layerBudget })
          : status.failed ? t('promptsStatusUnavailable2') : t('promptsLoading')}
      </div>
      <div className={css.itemMeta}>
        {report ? (count ? fill(t('promptsStatusOverrides'), { n: count }) : t('promptsStatusNone')) : ''}
        {state.invalid ? ` · ${t('invalid')}` : ''}
      </div>
      {report?.diagnostics.length ? <Fold id="prompts-diagnostics" title={fill(t('promptsStatusDiagnostics'), { n: report.diagnostics.length })} hint={t('promptsDiagnosticsFold')}>
        <ul data-dsh-browser-prompts-diagnostics>{report.diagnostics.map((entry, index) => <li key={index}>{entry.message}</li>)}</ul>
      </Fold> : null}
    </div>
    <div className={css.itemActions}><button type="button" className={css.link} onClick={refreshPromptsStatus}>{t('promptsRefresh')}</button></div>
  </div>
}

function useRefreshAfterSave(saving: boolean, refresh: () => void): void {
  useEffect(() => { if (!saving) refresh() }, [saving, refresh])
}

/** One text: the default beside your override. Save only stages. */
function TextDialog({ card, id, onClose }: { card: Card; id: PromptTextFieldId; onClose: () => void }) {
  const { t } = card
  const { state, disabled, defaults } = usePrompts(card)
  const spec = PROMPT_TEXT_FIELDS.find(entry => entry.id === id)!
  const labels = TEXT_LABELS[id]
  const base = defaults?.texts[id]
  const hasDefault = id !== 'skillBodyFile' && id !== 'skillAppend'
  const [draft, setDraft] = useState(state.texts[id].text)
  const tooLong = draft.length > spec.limit
  const same = base !== undefined && draft === base
  const inputId = `plugin-config-dsh-browser-prompts-${id}`
  return <Dialog open wide title={fill(t('promptEditTitle'), { name: t(labels.label) })} closeLabel={t('close')} description={t(labels.hint)} onClose={onClose}
    footer={<>
      {hasDefault && base !== undefined ? <Btn disabled={disabled || draft === base} onClick={() => setDraft(base)} data="prompt-start">{t('promptStart')}</Btn> : null}
      <Btn disabled={disabled || draft === ''} onClick={() => setDraft('')} data="prompt-restore">{t('promptRestore')}</Btn>
      <Btn onClick={onClose} data="prompt-cancel">{t('cancel')}</Btn>
      <Btn primary disabled={disabled || tooLong} onClick={() => { card.editPromptText(id, draft); onClose() }} data="prompt-save">{t('promptSave')}</Btn>
    </>}>
    <div className={css.compare}>
      <div className={css.compareCol}>
        <strong>{t('promptDefaultCol')}</strong>
        <pre className={css.preview} data-dsb-prompt-default>{hasDefault ? base ?? t('promptDefaultMissing') : t('promptNoDefault')}</pre>
      </div>
      <div className={css.compareCol}>
        <label htmlFor={inputId}>{t('promptMineCol')}</label>
        {spec.multiline
          ? <textarea id={inputId} className={`${css.input} ${css.textarea} ${css.code} ${tooLong ? css.invalidInput : ''}`} rows={12} spellCheck={false} value={draft} disabled={disabled}
            placeholder={t('promptEmptyIsDefault')} aria-invalid={tooLong || undefined} onChange={event => setDraft(event.currentTarget.value)} />
          : <TextInput id={inputId} value={draft} code disabled={disabled} invalid={tooLong} placeholder={t('promptEmptyIsDefault')} onChange={setDraft} />}
        <p className={tooLong ? `${css.rowHint} dsb-bad` : css.rowHint} role={tooLong ? 'alert' : undefined}>{tooLong ? t('promptsTooLong') : same ? t('promptSameAsDefault') : ''} ({draft.length}/{spec.limit})</p>
      </div>
    </div>
  </Dialog>
}

/** The seven texts as a list. */
function TextList({ card }: { card: Card }) {
  const { t } = card
  const { state, disabled } = usePrompts(card)
  const [editing, setEditing] = useState<PromptTextFieldId | undefined>()
  return <>
    <SubHead>{t('promptsListTitle')}</SubHead>
    <p className={css.rowHint}>{t('promptsListHint')}</p>
    <div className={css.list} data-dsb-prompt-list>
      {PROMPT_TEXT_FIELDS.map(spec => {
        const entry = state.texts[spec.id]
        const overridden = entry.text !== '' && !entry.sameAsDefault
        return <Item key={spec.id} data={spec.id} title={t(TEXT_LABELS[spec.id].label)}
          badges={<>
            <Badge tone={overridden ? 'info' : 'outline'}>{overridden ? t('promptStateOverridden') : t('promptStateDefault')}</Badge>
            {entry.text !== '' ? <Badge tone={entry.invalid ? 'danger' : 'neutral'}>{fill(t('promptChars'), { n: entry.text.length })}</Badge> : null}
          </>}
          meta={t(TEXT_LABELS[spec.id].hint)}
          actions={<>
            {entry.text !== '' ? <button type="button" className={css.link} disabled={disabled} onClick={() => card.editPromptText(spec.id, '')}>{t('promptRestore')}</button> : null}
            <Btn disabled={disabled} onClick={() => setEditing(spec.id)} data="prompt-edit">{t('edit')}</Btn>
          </>} />
      })}
    </div>
    {editing ? <TextDialog key={editing} card={card} id={editing} onClose={() => setEditing(undefined)} /> : null}
  </>
}

/** One entry of the groups / actions / errorHints lists. */
function EntryDialog({ card, entry, onClose }: { card: Card; entry?: PromptExtraEntry; onClose: () => void }) {
  const { t } = card
  const { disabled, defaults } = usePrompts(card)
  const [kind, setKind] = useState<PromptExtraKind>(entry?.kind ?? 'actions')
  const [key, setKey] = useState(entry?.key ?? '')
  const [summary, setSummary] = useState(entry?.summary ?? '')
  const [notes, setNotes] = useState(entry?.notes ?? '')
  const [text, setText] = useState(entry?.text ?? '')
  const known = defaults?.extras[kind] as Record<string, unknown> | undefined
  const base = known?.[key]
  const baseSummary = typeof base === 'object' && base !== null ? (base as { summary?: string }).summary : undefined
  const baseNotes = typeof base === 'object' && base !== null ? (base as { notes?: string }).notes : undefined
  const baseText = typeof base === 'string' ? base : undefined
  const keyProblem = key !== '' && !/^[A-Za-z0-9_.-]+$/.test(key)
  const unknown = key !== '' && !keyProblem && defaults !== undefined && !(key in (known ?? {}))
  const caps = { summary: PROMPT_LIMITS.summary, notes: PROMPT_LIMITS.topicText, text: PROMPT_LIMITS.errorHint }
  const over = (kind !== 'errorHints' && (summary.length > caps.summary || notes.length > caps.notes)) || (kind === 'errorHints' && text.length > caps.text)
  const complete = key !== '' && !keyProblem && !over && (kind === 'errorHints' ? text !== '' : summary !== '' || (kind === 'actions' && notes !== ''))
  const save = () => {
    card.setPromptExtra(kind, key, kind === 'errorHints' ? text : kind === 'groups' ? { summary } : { summary, notes })
    onClose()
  }
  const field = (label: string, id: string, value: string, set: (value: string) => void, cap: number, defaultText: string | undefined, rows: number) => <div className={css.compare} key={id}>
    <div className={css.compareCol}><strong>{label} · {t('promptDefaultCol')}</strong><pre className={css.preview}>{defaultText ?? t('promptNoDefault')}</pre></div>
    <div className={css.compareCol}>
      <label htmlFor={id}>{label} · {t('promptMineCol')}</label>
      <textarea id={id} className={`${css.input} ${css.textarea} ${value.length > cap ? css.invalidInput : ''}`} rows={rows} spellCheck={false} value={value} disabled={disabled} placeholder={t('promptEmptyIsDefault')} onChange={event => set(event.currentTarget.value)} />
      <p className={value.length > cap ? `${css.rowHint} dsb-bad` : css.rowHint}>({value.length}/{cap})</p>
    </div>
  </div>
  return <Dialog open wide title={entry ? fill(t('promptEntryEditTitle'), { key: entry.key }) : t('promptEntryNewTitle')} closeLabel={t('close')} onClose={onClose}
    footer={<>
      {entry ? <Btn danger disabled={disabled} onClick={() => { card.setPromptExtra(entry.kind, entry.key, undefined); onClose() }} data="entry-remove">{t('promptEntryRemove')}</Btn> : null}
      <Btn onClick={onClose} data="entry-cancel">{t('cancel')}</Btn>
      <Btn primary disabled={disabled || !complete} onClick={save} data="entry-save">{t('promptSave')}</Btn>
    </>}>
    <Row id="dsb-entry-kind" label={t('promptEntryKind')} hint={t('promptEntryKindHint')} labels={rowLabels(t)}>
      {entry ? <Badge tone="neutral">{t(KIND_LABELS[kind])}</Badge>
        : <Select id="dsb-entry-kind" value={kind} disabled={disabled} options={PROMPT_EXTRA_KEYS.map(value => ({ value, label: t(KIND_LABELS[value]) }))} onChange={value => setKind(value as PromptExtraKind)} />}
    </Row>
    <Row id="dsb-entry-key" label={t('promptEntryKey')} hint={t('promptEntryKeyHint')} invalid={keyProblem} problem={t('promptEntryKeyInvalid')} labels={rowLabels(t)}>
      {entry ? <code>{entry.key}</code> : <>
        <TextInput id="dsb-entry-key" value={key} list="dsb-entry-keys" code disabled={disabled} invalid={keyProblem} placeholder={kind === 'errorHints' ? 'DEADLINE' : kind === 'groups' ? 'act' : 'act.click'} onChange={setKey} />
        <datalist id="dsb-entry-keys">{Object.keys(known ?? {}).map(name => <option key={name} value={name} />)}</datalist>
      </>}
      {unknown ? <p className={css.rowHint} role="note">{t('promptEntryUnknown')}</p> : null}
    </Row>
    {kind === 'errorHints'
      ? field(t('promptEntryText'), 'dsb-entry-text', text, setText, caps.text, baseText, 6)
      : <>
        {field(t('promptEntrySummary'), 'dsb-entry-summary', summary, setSummary, caps.summary, baseSummary, 3)}
        {kind === 'actions' ? field(t('promptEntryNotes'), 'dsb-entry-notes', notes, setNotes, caps.notes, baseNotes, 8) : null}
      </>}
  </Dialog>
}

/** The entries you changed. */
function EntryList({ card }: { card: Card }) {
  const { t } = card
  const { state, disabled } = usePrompts(card)
  const [dialog, setDialog] = useState<{ entry?: PromptExtraEntry } | undefined>()
  return <>
    <SubHead>{t('promptsEntriesTitle')}</SubHead>
    <p className={css.rowHint}>{t('promptsEntriesHint')}</p>
    <div className={css.list} data-dsb-entry-list>
      {state.entries.length === 0 ? <p className={css.empty}>{t('promptsEntriesEmpty')}</p> : null}
      {state.entries.map(entry => <Item key={`${entry.kind}:${entry.key}`} data={`${entry.kind}:${entry.key}`} title={<code>{entry.key}</code>} badges={<Badge tone="neutral">{t(KIND_LABELS[entry.kind])}</Badge>}
        meta={entry.summary ?? entry.text ?? entry.notes}
        actions={<Btn disabled={disabled} onClick={() => setDialog({ entry })} data="entry-edit">{t('edit')}</Btn>} />)}
    </div>
    <div><Btn disabled={disabled} onClick={() => setDialog({})} data="entry-add">{t('promptsEntryAdd')}</Btn></div>
    {dialog ? <EntryDialog key={dialog.entry ? `${dialog.entry.kind}:${dialog.entry.key}` : '\u0000new'} card={card} entry={dialog.entry} onClose={() => setDialog(undefined)} /> : null}
  </>
}

/** The default text, commented YAML or JSON, to copy. */
function ExportDialog({ card, onClose }: { card: Card; onClose: () => void }) {
  const { t } = card
  const { status } = usePrompts(card)
  const [form, setForm] = useState<'yaml' | 'json'>('yaml')
  const [copied, setCopied] = useState(false)
  const lang = t('lang')
  const { exportPromptDefaults, exportPromptYaml } = card
  useEffect(() => { void exportPromptDefaults(); void exportPromptYaml(lang) }, [exportPromptDefaults, exportPromptYaml, lang])
  const shown = form === 'yaml' ? (status.defaultsYaml?.lang === lang ? status.defaultsYaml.text : undefined) : status.defaults
  const failed = form === 'yaml' ? status.yamlFailed : status.defaultsFailed
  return <Dialog open wide title={t('promptExportTitle')} closeLabel={t('close')} description={t('promptExportHint')} onClose={onClose}
    footer={<>
      <Btn disabled={shown === undefined} onClick={() => { void navigator.clipboard?.writeText(shown ?? '').then(() => setCopied(true)).catch(() => undefined) }} data="export-copy">{copied ? t('promptExportCopied') : t('promptExportCopy')}</Btn>
      <Btn primary onClick={onClose}>{t('close')}</Btn>
    </>}>
    <SegmentedControl id="dsb-export-form" label={t('promptExportTitle')} value={form} onChange={next => { setForm(next); setCopied(false) }}
      options={[{ value: 'yaml', label: t('promptExportYaml') }, { value: 'json', label: t('promptExportJson') }]} />
    {failed ? <p className="dsb-bad" role="alert">{t('promptExportFailed')}</p>
      : <textarea className={`${css.input} ${css.textarea} ${css.code}`} rows={16} readOnly spellCheck={false} aria-label={t('promptExportTitle')} value={shown ?? t('promptExportLoading')}
        onFocus={event => event.currentTarget.select()} data-dsh-browser-prompts-defaults />}
  </Dialog>
}

export function PromptsGroup({ card }: { card: Card }) {
  const { t } = card
  const { state, disabled } = usePrompts(card)
  const [exporting, setExporting] = useState(false)
  const overridden = state.overridden
  return <Group id="prompts" title={t('groupPrompts')} summary={t('groupPromptsSub')} badges={overridden ? <Badge tone="info">{t('overridden')}</Badge> : null}>
    <div className={css.stack} data-dsb-field="prompts" data-dsh-browser-prompts>
      <StatusLine card={card} />
      <Row label={t('promptsSkillEnabled')} hint={t('promptsSkillEnabledHint')} labels={rowLabels(t)} inline>
        <Toggle label={t('promptsSkillEnabled')} checked={state.skillEnabled} disabled={disabled} onChange={card.setPromptSkillEnabled} />
      </Row>
      <TextList card={card} />
      <EntryList card={card} />
      <div data-dsh-browser-prompts-export><Btn onClick={() => setExporting(true)} data="export-open">{t('promptExportOpen')}</Btn></div>
      <p className={css.notice} role="note">{t('promptsRestart')}</p>
    </div>
    {exporting ? <ExportDialog card={card} onClose={() => setExporting(false)} /> : null}
  </Group>
}
