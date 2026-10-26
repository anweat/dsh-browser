/**
 * "Automation assets": reusable recipes and userscripts. The group is a list (a suggestion row per candidate the plugin
 * wants summarized, a row per asset) and ONE editor dialog; it does not lay the editor out beside the list any more.
 *
 * The editing logic is unchanged and lives in `automation-assets-client.ts`: every way out of unsaved edits (closing the
 * dialog, creating, forking, converting, refreshing) goes through a request/confirm pair, which this dialog shows as a
 * confirmation inside itself. Closing the dialog is a request to select nothing.
 * @module dsh-browser/client/group-assets
 */

import { useEffect } from 'react'
import { inputSetShortfall } from '../activation-rules.ts'
import { credentialView, identicalOutputPairs, inputSetLines, isDirty, shortHash } from './asset-editor.ts'
import type { AssetNoticeKind } from './automation-assets-client.ts'
import { fill, type Card } from './field-rows.tsx'
import { styles as css } from './styles.ts'
import { Badge, Btn, Dialog, Group, Item, type Tone } from './ui-kit.tsx'

const STATUS_TONE: Record<string, Tone> = { active: 'success', draft: 'info', archived: 'outline' }

export function AssetsGroup({ card }: { card: Card }) {
  const { t } = card
  const state = card.useAutomationAssets(snapshot => snapshot)
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
  const editing = !!selected || editor.text !== ''
  const open = (id: string) => card.requestSelectAutomationAsset(id)

  return <Group id="assets" title={t('groupAssets')} summary={t('groupAssetsSub')} badges={assets.length ? <Badge tone="neutral">{assets.length}</Badge> : null}>
    <div className={css.stack} data-dsh-browser-assets>
      <p className={css.rowHint}>{t('assetLibraryHint')}</p>
      {state.loading ? <p className={css.notice}>{t('assetLoading')}</p> : null}
      {state.failed ? <p className={css.failed} role="alert">{state.error || t('assetFailed')}</p> : null}
      {candidates.length ? <div className={css.list} data-dsb-asset-candidates>{candidates.map(candidate => <Item key={candidate.id} data={candidate.id} title={candidate.title}
        meta={`${candidate.domain} · ${candidate.successfulRuns} ${t('assetRuns')} · ${candidate.distinctSessions} ${t('assetSessions')}`}
        badges={<Badge tone="info">{t('assetSuggestions')}</Badge>}
        actions={<><Btn disabled={state.busy} onClick={() => card.dismissAutomationCandidate(candidate.id)}>{t('assetDismiss')}</Btn><Btn primary disabled={state.busy} onClick={() => card.summarizeAutomationCandidate(candidate.id)}>{t('assetSummarize')}</Btn></>} />)}</div> : null}
      <div className={css.assetToolbar}>
        <div><strong>{t('assetScripts')}</strong><p className={css.hint}>{t('assetScriptsHint')}</p></div>
        <div className={css.actions}>
          <Btn onClick={() => card.requestNewAutomationAsset('recipe')} data="asset-new-recipe">{t('assetNewRecipe')}</Btn>
          <Btn onClick={() => card.requestNewAutomationAsset('userscript')} data="asset-new-script">{t('assetNewScript')}</Btn>
          <Btn onClick={card.requestRefreshAutomationAssets} data="asset-refresh">{t('assetRefresh')}</Btn>
        </div>
      </div>
      <div className={css.list} data-dsb-asset-list>
        {assets.length ? assets.map(asset => <Item key={asset.id} data={asset.id}
          title={<button type="button" className={css.link} onClick={() => open(asset.id)}>{asset.name}</button>}
          badges={<><Badge tone="neutral">{asset.kind}</Badge><Badge tone={STATUS_TONE[asset.status] ?? 'outline'}>{asset.status}</Badge></>}
          meta={`r${asset.revision} · ${asset.testStatus}`}
          actions={<Btn onClick={() => open(asset.id)} data="asset-open">{t('edit')}</Btn>} />) : <p className={css.empty}>{t('assetEmpty')}</p>}
      </div>
    </div>
    <Dialog open={editing} wide title={selected?.name ?? t('assetNewTitle')} closeLabel={t('close')} onClose={() => card.requestSelectAutomationAsset(undefined)}
      footer={<Btn onClick={() => card.requestSelectAutomationAsset(undefined)} data="asset-close">{t('close')}</Btn>}>
      {editor.confirm ? <div className={css.failed} role="alertdialog" aria-label={t('assetLeaveTitle')} data-dsh-browser-leave>
        <p>{t('assetLeaveTitle')}</p>
        <div className={css.actions}><Btn onClick={card.cancelLeaveAutomationAsset}>{t('assetLeaveKeep')}</Btn><Btn primary onClick={card.confirmLeaveAutomationAsset}>{t('assetLeaveConfirm')}</Btn></div>
      </div> : null}
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
        <textarea id="dsh-browser-asset-editor" aria-label={t('assetEditor')} className={`${css.input} ${css.textarea} ${css.code} ${editor.notice?.kind === 'json' ? css.invalidInput : ''}`} rows={18} value={editor.text} spellCheck={false} disabled={state.busy} placeholder={t('assetEditorHint')} onChange={event => card.editAutomationAsset(event.currentTarget.value)} />
        {editor.notice ? <p className={css.failed} role="alert" data-dsh-browser-notice={editor.notice.kind}>{noticeLabel(editor.notice.kind)}{editor.notice.message}{editor.notice.code ? ` [${editor.notice.code}]` : ''}</p> : <p className={css.hint}>{dirty ? t('assetUnsaved') : t('assetSourceBoundary')}</p>}
        {draft || !selected ? <div className={css.assetTestForm}><input className={css.input} value={editor.testUrl} aria-label={t('assetTestUrl')} placeholder={t('assetTestUrl')} onChange={event => card.setAssetTestUrl(event.currentTarget.value)} /><textarea className={`${css.input} ${css.textarea} ${css.code}`} rows={3} value={editor.testInputs} spellCheck={false} aria-label={t('assetTestInputs')} onChange={event => card.setAssetTestInputs(event.currentTarget.value)} /></div> : null}
        {shortfall ? <p className={css.hint} role="note" data-dsh-browser-activation-hint>{shortfallText}</p> : null}
        <div className={css.actions}>
          {selected ? <Btn disabled={state.busy || dirty} onClick={() => card.validateAutomationAsset(selected.id)}>{t('assetValidate')}</Btn> : null}
          {draft || !selected ? <Btn disabled={state.busy || !editor.testUrl.trim() || !editor.text} onClick={() => void card.saveAndTestAutomationAsset()}>{saveFirst ? t('assetSaveAndTest') : t('assetTest')}</Btn> : null}
          {draft ? <Btn disabled={state.busy || dirty || !credentials.vouches || !!shortfall} title={dirty ? t('assetActivateNeedsSave') : shortfallText || undefined} onClick={() => void card.activateAutomationAsset()}>{t('assetActivate')} r{selected.revision}</Btn> : null}
          {convertible ? <Btn disabled={state.busy} onClick={() => card.requestConvertAutomationAsset(selected.id)}>{t('assetConvert')}</Btn> : null}
          {selected && selected.status !== 'draft' ? <Btn disabled={state.busy} onClick={() => card.requestForkAutomationAsset(selected.id)}>{t('assetFork')}</Btn> : null}
          {selected && selected.status !== 'archived' ? <Btn disabled={state.busy} onClick={() => card.setAutomationAssetStatus(selected.id, 'archived')}>{t('assetArchive')}</Btn> : null}
          <Btn primary disabled={state.busy || !editor.text || selected?.status === 'active'} onClick={() => void card.saveEditedAutomationAsset()}>{t('assetSaveDraft')}</Btn>
        </div>
      </div>
    </Dialog>
  </Group>
}
