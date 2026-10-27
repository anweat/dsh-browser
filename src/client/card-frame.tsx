/**
 * The frame around the groups: the status summary on top (with the warnings dialog) and the save bar at the bottom.
 *
 * The Host's `SettingsForm` offers one save button below the controls. This card needs the bar to stay in view while a
 * long page scrolls, to say how many edits are waiting, and to offer "Discard", so the frame is built here; the
 * behaviors `SettingsForm` has are kept: it says so when the settings are not served or read-only, and it drops the
 * staged edits when the page is left.
 * @module dsh-browser/client/card-frame
 */

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { fill, type Card } from './field-rows.tsx'
import { styles as css } from './styles.ts'
import { Badge, Btn, Dialog, type Tone } from './ui-kit.tsx'

const MODE_TONE: Record<string, Tone> = { 'read-only': 'success', standard: 'info', autonomous: 'warning', unrestricted: 'danger' }

/** Everything the "needs attention" badge counts: the warnings the running plugin reported about the configuration, and the overlay warning. */
function useWarnings(card: Card): { config: string[]; overlay: string | undefined; overlayActive: boolean; revision: number | undefined } {
  const report = card.usePolicyStatus(snapshot => snapshot.report)
  return { config: report?.configWarnings ?? [], overlay: report?.warning, overlayActive: report?.overlayActive ?? false, revision: report?.revision }
}

export function SummaryBar({ card }: { card: Card }) {
  const { t } = card
  const [open, setOpen] = useState(false)
  const view = card.useBrowserSettings(snapshot => ({
    enabled: snapshot.fields.enabled.text !== 'false', mode: snapshot.fields.automationMode.text || 'standard',
    surface: snapshot.fields.toolSurface.text || 'indexed', opencli: snapshot.fields.opencliEnabled.text !== 'false',
  }))
  const warnings = useWarnings(card)
  const runtime = card.usePolicyStatus(snapshot => snapshot.runtime)
  const noBrowser = runtime !== undefined && !runtime.browser.ready
  const opencliMissing = view.opencli && runtime !== undefined && !runtime.opencli.installed
  // Only "nothing can launch" counts as a warning; a system Chrome standing in, or the optional OpenCLI being absent, are notices.
  const count = warnings.config.length + (warnings.overlay ? 1 : 0) + (noBrowser ? 1 : 0)
  const notices = [
    ...runtime && runtime.browser.ready && runtime.browser.note ? [runtime.browser.note] : [],
    ...opencliMissing && runtime?.opencli.hint ? [runtime.opencli.hint] : [],
  ]
  return <div className={css.summaryBar} role="group" aria-label={t('summaryTitle')} data-dsb-summary>
    <strong>{t('summaryTitle')}</strong>
    <Badge tone={view.enabled ? 'success' : 'neutral'}>{view.enabled ? t('summaryEnabledOn') : t('summaryEnabledOff')}</Badge>
    <Badge tone={MODE_TONE[view.mode] ?? 'neutral'}>{t('summaryMode')} {view.mode}</Badge>
    <Badge tone="neutral">{t('summarySurface')} {view.surface}</Badge>
    <Badge tone="neutral">{!view.opencli ? t('summaryOpencliOff') : opencliMissing ? t('summaryOpencliMissing') : t('summaryOpencliOn')}</Badge>
    {noBrowser ? <Badge tone="warning">{t('summaryNoBrowser')}</Badge> : runtime?.browser.source === 'system-browser' ? <Badge tone="neutral">{t('summaryBrowserSystem')}</Badge> : null}
    {warnings.overlayActive ? <Badge tone="warning">{t('summaryOverlay')}</Badge> : null}
    <button type="button" className={css.link} onClick={() => setOpen(true)} data-dsb-warnings-count={count}>
      {count ? <Badge tone="warning">{fill(t('summaryWarnings'), { n: count })}</Badge> : <span className={css.muted}>{t('summaryNoWarnings')}</span>} · {t('summaryDetails')}
    </button>
    <Dialog open={open} title={t('warningsTitle')} closeLabel={t('close')} onClose={() => setOpen(false)} footer={<Btn onClick={() => setOpen(false)} primary>{t('close')}</Btn>}>
      {count === 0 ? <p className={css.rowHint}>{t('warningsNone')}</p> : null}
      {noBrowser ? <div className={css.stack} data-dsb-runtime-warning>
        <strong>{t('warningsNoBrowser')}</strong>
        <p className={`${css.rowHint} dsb-bad`} role="alert">{runtime?.browser.installAdvice}</p>
      </div> : null}
      {warnings.config.length ? <div className={css.stack} data-dsb-config-warnings>
        <strong>{t('warningsConfig')}</strong>
        <ul>{warnings.config.map((warning, index) => <li key={index}>{warning}</li>)}</ul>
      </div> : null}
      {notices.length ? <div className={css.stack} data-dsb-runtime-notices>
        <strong>{t('noticesRuntime')}</strong>
        <ul>{notices.map((notice, index) => <li key={index}>{notice}</li>)}</ul>
      </div> : null}
      {warnings.overlay ? <div className={css.stack} data-dsb-policy-warning>
        <strong>{t('warningsOverlay')}</strong>
        <p className={`${css.rowHint} dsb-bad`} role="alert">{warnings.overlay}</p>
      </div> : null}
    </Dialog>
  </div>
}

export function SaveBar({ card }: { card: Card }) {
  const { t } = card
  const state = card.useBrowserSettings(snapshot => snapshot)
  const count = state.changes.length
  const blocked = !state.dirty || state.invalid || state.saving
  // The bar floats at the bottom of the window only while there is something to act on (unsaved edits, a save running or failed).
  // Otherwise it sits in the page flow after the last group, so it cannot cover a group heading the user is about to click.
  const floating = state.dirty || state.saving || state.failed
  return <div className={css.savebar} role="region" aria-label={t('save')} data-dsb-savebar data-dsb-floating={floating ? '' : undefined}>
    <div className={css.saveText}>
      <span data-dsb-unsaved={count}>{state.invalid ? t('savebarInvalid') : count ? fill(t('savebarDirty'), { n: count }) : t('savebarClean')}</span>
      {state.failed ? <span className="dsb-bad" role="status">{t('saveFailed')}</span> : null}
    </div>
    <div className={css.actions}>
      <Btn onClick={card.discard} disabled={!state.dirty || state.saving} data="discard">{t('discardChanges')}</Btn>
      <Btn primary onClick={card.save} disabled={blocked} data="save">{state.saving ? t('saving') : t('save')}</Btn>
    </div>
  </div>
}

/** The page frame: nothing but a notice while the settings are not served; the staged edits are dropped when the page is left. */
export function Frame({ card, children }: { card: Card; children: ReactNode }) {
  const { t } = card
  const state = card.useBrowserSettings(snapshot => ({ available: snapshot.available, writable: snapshot.writable }))
  const discard = useRef(card.discard)
  discard.current = card.discard
  useEffect(() => () => { discard.current() }, [])
  if (!state.available) return <p className={css.notice} role="status">{t('unavailable')}</p>
  return <div className={css.root} data-dsb-root>
    {!state.writable ? <p className={css.notice} role="status">{t('readOnly')}</p> : null}
    {children}
  </div>
}
