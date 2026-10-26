/**
 * "Sign-in and permissions": which login profiles exist and where they may be used, which one is the default, whether an
 * agent may put private-network names in them, and what agents have changed on top (the policy overlay).
 *
 * The profile list is a list: a row per profile, a dialog to edit one or add one. The dialog stages its result like any
 * other control, and the page's Save writes it. The overlay's audit trail is behind "View change log" instead of being
 * spread over the page.
 * @module dsh-browser/client/group-access
 */

import { useEffect, useState } from 'react'
import { domainProblem, idProblem, isPrivateName, parseProfiles, profilePathFor, type AuthProfileEntry } from './auth-profiles-form.ts'
import { controlId, fill, rowLabels, SwitchRow, TextRow, useField, useOverriddenCount, type Card } from './field-rows.tsx'
import { styles as css } from './styles.ts'
import { Badge, Btn, Chips, Dialog, Fold, Group, Item, Row, Select, SubHead, TextInput, Toggle } from './ui-kit.tsx'

export const ACCESS_FIELDS = ['defaultAuthProfile', 'allowPrivateHosts', 'storageStatePath'] as const

/** The staged profiles, and what the running plugin reports about them (the overlay's origin, the login-state directory). */
function useProfiles(card: Card) {
  const staged = card.useBrowserSettings(snapshot => snapshot.jsonFields.authProfiles?.text ?? '')
  const disabled = card.useBrowserSettings(snapshot => !snapshot.writable)
  const policy = card.usePolicyStatus(snapshot => snapshot)
  const profiles = parseProfiles(staged)
  return { profiles, ids: Object.keys(profiles).sort(), disabled, report: policy.report, policy }
}

function ProfileDialog(props: { card: Card; id?: string; entry?: AuthProfileEntry; existing: readonly string[]; authDir?: string; disabled: boolean; onClose: () => void }) {
  const { card, entry } = props
  const { t } = card
  const editing = props.id !== undefined
  const [id, setId] = useState(props.id ?? '')
  const [domains, setDomains] = useState<string[]>(entry?.allowedDomains ?? [])
  const [persist, setPersist] = useState(entry?.persistState ?? false)
  const [confirmRemove, setConfirmRemove] = useState(false)
  const idRefused = editing ? undefined : id === '' ? undefined : idProblem(id, props.existing)
  const path = entry?.storageStatePath ?? (props.authDir && id ? profilePathFor(props.authDir, id) : undefined)
  const complete = (editing || (id !== '' && !idRefused)) && domains.length > 0 && path !== undefined
  const save = () => {
    if (!complete || path === undefined) return
    card.saveAuthProfile(editing ? props.id! : id, { storageStatePath: path, allowedDomains: domains, persistState: persist })
    props.onClose()
  }
  const privateDomains = domains.filter(isPrivateName)
  return <Dialog open title={editing ? t('authEdit') : t('authNew')} closeLabel={t('close')} onClose={props.onClose}
    footer={<>
      {editing ? (confirmRemove
        ? <Btn danger disabled={props.disabled} onClick={() => { card.removeAuthProfile(props.id!); props.onClose() }} data="auth-remove-confirm">{t('authRemoveConfirm')}</Btn>
        : <Btn danger disabled={props.disabled} onClick={() => setConfirmRemove(true)} data="auth-remove">{t('authRemove')}</Btn>) : null}
      <Btn onClick={props.onClose} data="auth-cancel">{t('cancel')}</Btn>
      <Btn primary disabled={!complete || props.disabled} onClick={save} data="auth-save">{t('done')}</Btn>
    </>}>
    {confirmRemove ? <p className={css.rowHint} role="note">{t('authRemoveNote')}</p> : null}
    <Row id="dsb-auth-id" label={t('authId')} hint={t('authIdHint')} invalid={!!idRefused} problem={idRefused ? t(idRefused) : undefined} labels={rowLabels(t)} wide>
      {editing ? <code>{props.id}</code> : <TextInput id="dsb-auth-id" value={id} invalid={!!idRefused} disabled={props.disabled} placeholder="work-portal" code onChange={setId} />}
    </Row>
    <Row id="dsb-auth-domains" label={t('authDomains')} hint={t('authDomainsHint')} invalid={domains.length === 0} problem={t('authDomainsEmpty')} labels={rowLabels(t)} wide>
      <Chips id="dsb-auth-domains" values={domains} disabled={props.disabled} placeholder="example.com" addLabel={t('authDomains')} removeLabel={t('remove')} onChange={setDomains}
        check={value => { const refused = domainProblem(value); return refused ? t(refused) : undefined }} />
      {privateDomains.length ? <p className={css.rowHint} role="note">{t('authDomainPrivate')}</p> : null}
    </Row>
    <Row label={t('authPersist')} hint={t('authPersistHint')} help={t('authPersistHelp')} labels={rowLabels(t)} inline>
      <Toggle label={t('authPersist')} checked={persist} disabled={props.disabled} onChange={setPersist} />
    </Row>
    <Row label={t('authPath')} hint={t('authPathHint')} labels={rowLabels(t)} wide>
      <code data-dsb-auth-path className="dsb-preview">{path ?? t('authPathUnknown')}</code>
      <p className={css.rowHint}>{t('authPathRule')}</p>
    </Row>
  </Dialog>
}

/** The login profiles: a row each, an edit dialog, and an add button. */
function ProfileList({ card }: { card: Card }) {
  const { t } = card
  const { profiles, ids, disabled, report, policy } = useProfiles(card)
  const [dialog, setDialog] = useState<{ id?: string } | undefined>()
  const effective = new Map((report?.authProfiles ?? []).map(profile => [profile.id, profile]))
  const overlayOnly = (report?.authProfiles ?? []).filter(profile => profile.origin === 'overlay-created' && !(profile.id in profiles))
  const origin = (value: 'baseline' | 'overlay-changed' | 'overlay-created') => value === 'overlay-changed' ? t('authOriginChanged') : value === 'overlay-created' ? t('authOriginCreated') : ''
  const row = (id: string, entry: AuthProfileEntry, overlayCreated = false) => {
    const live = effective.get(id)
    const domains = live && live.origin !== 'baseline' ? live.allowedDomains : entry.allowedDomains
    const persistState = live && live.origin !== 'baseline' ? live.persistState : entry.persistState
    return <Item key={id} data={id} title={<code>{id}</code>}
      badges={<>
        <Badge tone="neutral">{fill(t('authDomainsCount'), { n: domains.length })}</Badge>
        <Badge tone={persistState ? 'info' : 'outline'}>{persistState ? t('authPersistOn') : t('authPersistOff')}</Badge>
        {live && live.origin !== 'baseline' ? <Badge tone="warning">{origin(live.origin)}</Badge> : null}
      </>}
      meta={overlayCreated ? t('authOverlayOnly') : domains.join(', ') || '—'}
      actions={<>
        {live && live.origin !== 'baseline' ? <button type="button" className={css.link} disabled={policy.busy} onClick={() => void card.clearPolicyOverlay('authProfile', id)}>{t('authRevert')}</button> : null}
        {overlayCreated ? null : <Btn disabled={disabled} onClick={() => setDialog({ id })} data="auth-edit">{t('edit')}</Btn>}
      </>} />
  }
  return <Row field="authProfiles" label={t('authProfiles')} hint={t('authProfilesHint')} help={t('authProfilesHelp')} labels={rowLabels(t)} wide>
    <div className={css.list} data-dsb-profiles>
      {ids.length === 0 && overlayOnly.length === 0 ? <p className={css.empty}>{t('authProfilesEmpty')}</p> : null}
      {ids.map(id => row(id, profiles[id]!))}
      {overlayOnly.map(profile => row(profile.id, { storageStatePath: profile.storageStatePath ?? '', allowedDomains: profile.allowedDomains, persistState: profile.persistState }, true))}
    </div>
    <div><Btn disabled={disabled} onClick={() => setDialog({})} data="auth-add">{t('authAdd')}</Btn></div>
    {dialog ? <ProfileDialog key={dialog.id ?? '\u0000new'} card={card} id={dialog.id} entry={dialog.id ? profiles[dialog.id] : undefined} existing={ids} authDir={report?.authDir} disabled={disabled} onClose={() => setDialog(undefined)} /> : null}
  </Row>
}

/** The default profile, picked from the list above (a stored name that is not in it is shown as missing). */
function DefaultProfileRow({ card }: { card: Card }) {
  const { t } = card
  const { ids } = useProfiles(card)
  const field = useField(card, 'defaultAuthProfile')
  const id = controlId('defaultAuthProfile')
  const current = field.state.text
  const missing = current !== '' && !ids.includes(current)
  return <Row field="defaultAuthProfile" id={id} label={t('defaultAuthProfile')} hint={t('defaultAuthProfileHint')} overridden={field.state.overridden} invalid={field.state.invalid || missing}
    problem={missing ? `${current} ${t('defaultAuthProfileMissing')}` : t('invalid')} disabled={field.disabled} labels={rowLabels(t)} onReset={field.reset}>
    <Select id={id} value={current === '' ? '__none__' : current} muted={!field.state.overridden} invalid={missing} disabled={field.disabled}
      options={[{ value: '__none__', label: t('defaultAuthProfileNone') }, ...ids.map(entry => ({ value: entry, label: entry }))]}
      onChange={value => field.edit(value === '__none__' ? '' : value)} />
  </Row>
}

/** What agents changed on top of this page's settings: a status line, the change log in a dialog, and the way back to the baseline. */
function OverlayRows({ card }: { card: Card }) {
  const { t } = card
  const state = card.usePolicyStatus(snapshot => snapshot)
  const saving = card.useBrowserSettings(snapshot => snapshot.saving)
  const { refreshPolicyStatus } = card
  useEffect(() => { if (!saving) refreshPolicyStatus() }, [saving, refreshPolicyStatus])
  const [open, setOpen] = useState(false)
  const report = state.report
  const origin = (value: 'baseline' | 'overlay-changed' | 'overlay-created') => t(({ baseline: 'policyOriginBaseline', 'overlay-changed': 'policyOriginChanged', 'overlay-created': 'policyOriginCreated' } as const)[value])
  const direction = (value: 'tighten' | 'loosen' | 'none') => t(({ tighten: 'policyTightened', loosen: 'policyLoosened', none: 'policyUnchanged' } as const)[value])
  const usage = report ? Object.entries(report.usagePolicy).filter(([, entry]) => entry.overridden) : []
  return <div data-dsb-policy>
    <Row label={t('policyOverlay')} hint={t('policyOverlayHint')} help={t('policyOverlayHelp')} labels={rowLabels(t)} wide>
      <div className={css.item} data-dsb-policy-status>
        <div className={css.itemMain}>
          <div className={css.itemTitle} data-dsh-browser-policy-revision>
            {state.loading && !report ? t('promptsLoading') : state.failed ? t('policyUnavailable') : report?.overlayActive ? <Badge tone="warning">{fill(t('policyOverlayActive'), { n: report.revision })}</Badge> : <span className={css.muted}>{t('policyOverlayIdle')}</span>}
          </div>
          {report?.warning ? <div className="dsb-bad" role="alert" data-dsh-browser-policy-warning>{report.warning}</div> : null}
        </div>
        <div className={css.itemActions}>
          <Btn onClick={() => setOpen(true)} data="policy-audit">{t('policyAuditOpen')}</Btn>
          <Btn disabled={state.busy || !report || (!report.overlayActive && !report.warning)} onClick={() => void card.clearPolicyOverlay('all')} data="policy-clear">{t('policyClearAll')}</Btn>
        </div>
      </div>
      {state.error ? <p className="dsb-bad" role="alert">{state.error}</p> : null}
    </Row>
    <Dialog open={open} wide title={t('policyAuditTitle')} closeLabel={t('close')} onClose={() => setOpen(false)}
      footer={<Btn primary onClick={() => setOpen(false)}>{t('close')}</Btn>}>
      {report ? <>
        <p className={css.rowHint} data-dsh-browser-policy-meta>{t('policyRevision')} {report.revision}{report.updatedAt ? ` · ${new Date(report.updatedAt).toLocaleString()}` : ''} · {report.overlayActive ? t('policyActive') : t('policyInactive')} · {t('policyAuthDirLabel')}: <code>{report.authDir}</code></p>
        {report.warning ? <p className="dsb-bad" role="alert">{report.warning}</p> : null}
        <SubHead>{t('policyProfiles')}</SubHead>
        {report.authProfiles.length
          ? <div className={css.list} data-dsh-browser-policy-profiles>{report.authProfiles.map(profile => <Item key={profile.id} data={profile.id} title={<code>{profile.id}</code>}
            badges={<Badge tone={profile.origin === 'baseline' ? 'outline' : 'warning'}>{origin(profile.origin)}</Badge>}
            meta={`${profile.allowedDomains.join(', ')} · persistState=${String(profile.persistState)}`} />)}</div>
          : <p className={css.empty}>{t('policyNoProfiles')}</p>}
        {report.removedByOverlay.length ? <p className={css.rowHint} data-dsh-browser-policy-removed>{t('policyRemovedLabel')}: {report.removedByOverlay.join(', ')}</p> : null}
        {usage.length ? <>
          <SubHead>{t('policyUsageEffective')}</SubHead>
          <div className={css.list} data-dsh-browser-policy-usage>{usage.map(([key, entry]) => <Item key={key} title={<code>{key} = {entry.value}</code>} meta={`${t('policyBaselineWas')} ${entry.baseline}`} />)}</div>
        </> : null}
        <SubHead>{t('policyAudit')}</SubHead>
        {report.audit.length
          ? <div className={css.list} data-dsh-browser-policy-audit>{[...report.audit].reverse().map(entry => <Item key={entry.revision}
            title={<>r{entry.revision} · {entry.action} <Badge tone={entry.direction === 'loosen' ? 'warning' : entry.direction === 'tighten' ? 'success' : 'outline'}>{direction(entry.direction)}</Badge></>}
            meta={<>{new Date(entry.at).toLocaleString()} · {entry.source}{entry.session ? ` ${entry.session}` : ''} · {entry.reason}{entry.changes.length ? ` — ${entry.changes.join('; ')}` : ''}</>} />)}</div>
          : <p className={css.empty}>{t('policyNoAudit')}</p>}
        <p className={css.rowHint}>{t('policyUnrestrictedNote')}</p>
      </> : <p className={css.empty}>{state.failed ? t('policyUnavailable') : t('promptsLoading')}</p>}
    </Dialog>
  </div>
}

export function AccessGroup({ card }: { card: Card }) {
  const { t } = card
  const count = useOverriddenCount(card, [...ACCESS_FIELDS, 'authProfiles'])
  return <Group id="access" title={t('groupAccess')} summary={t('groupAccessSub')} badges={count ? <Badge tone="info">{fill(t('overriddenCount'), { n: count })}</Badge> : null}>
    <ProfileList card={card} />
    <DefaultProfileRow card={card} />
    <SwitchRow card={card} name="allowPrivateHosts" risk={t('riskNote')} />
    <OverlayRows card={card} />
    <Fold id="access-legacy" title={t('browserAdvanced')}>
      <TextRow card={card} name="storageStatePath" code />
    </Fold>
  </Group>
}
