import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
/**
 * "Sign-in and permissions": which login profiles exist and where they may be used, which one is the default, whether an
 * agent may put private-network names in them, and what agents have changed on top (the policy overlay).
 *
 * The profile list is a list: a row per profile, a dialog to edit one or add one. The dialog stages its result like any
 * other control, and the page's Save writes it. The overlay's audit trail is behind "View change log" instead of being
 * spread over the page.
 * @module dsh-browser/client/group-access
 */
import { useEffect, useState } from 'react';
import { domainProblem, idProblem, isPrivateName, parseProfiles, profilePathFor } from "./auth-profiles-form.js";
import { controlId, fill, rowLabels, SwitchRow, TextRow, useField, useOverriddenCount } from "./field-rows.js";
import { styles as css } from "./styles.js";
import { Badge, Btn, Chips, Dialog, Fold, Group, Item, Row, Select, SubHead, TextInput, Toggle } from "./ui-kit.js";
export const ACCESS_FIELDS = ['defaultAuthProfile', 'allowPrivateHosts', 'storageStatePath'];
/** The staged profiles, and what the running plugin reports about them (the overlay's origin, the login-state directory). */
function useProfiles(card) {
    const staged = card.useBrowserSettings(snapshot => snapshot.jsonFields.authProfiles?.text ?? '');
    const disabled = card.useBrowserSettings(snapshot => !snapshot.writable);
    const policy = card.usePolicyStatus(snapshot => snapshot);
    const profiles = parseProfiles(staged);
    return { profiles, ids: Object.keys(profiles).sort(), disabled, report: policy.report, policy };
}
function ProfileDialog(props) {
    const { card, entry } = props;
    const { t } = card;
    const editing = props.id !== undefined;
    const [id, setId] = useState(props.id ?? '');
    const [domains, setDomains] = useState(entry?.allowedDomains ?? []);
    const [persist, setPersist] = useState(entry?.persistState ?? false);
    const [confirmRemove, setConfirmRemove] = useState(false);
    const idRefused = editing ? undefined : id === '' ? undefined : idProblem(id, props.existing);
    const path = entry?.storageStatePath ?? (props.authDir && id ? profilePathFor(props.authDir, id) : undefined);
    const complete = (editing || (id !== '' && !idRefused)) && domains.length > 0 && path !== undefined;
    const save = () => {
        if (!complete || path === undefined)
            return;
        card.saveAuthProfile(editing ? props.id : id, { storageStatePath: path, allowedDomains: domains, persistState: persist });
        props.onClose();
    };
    const privateDomains = domains.filter(isPrivateName);
    return _jsxs(Dialog, { open: true, title: editing ? t('authEdit') : t('authNew'), closeLabel: t('close'), onClose: props.onClose, footer: _jsxs(_Fragment, { children: [editing ? (confirmRemove
                    ? _jsx(Btn, { danger: true, disabled: props.disabled, onClick: () => { card.removeAuthProfile(props.id); props.onClose(); }, data: "auth-remove-confirm", children: t('authRemoveConfirm') })
                    : _jsx(Btn, { danger: true, disabled: props.disabled, onClick: () => setConfirmRemove(true), data: "auth-remove", children: t('authRemove') })) : null, _jsx(Btn, { onClick: props.onClose, data: "auth-cancel", children: t('cancel') }), _jsx(Btn, { primary: true, disabled: !complete || props.disabled, onClick: save, data: "auth-save", children: t('done') })] }), children: [confirmRemove ? _jsx("p", { className: css.rowHint, role: "note", children: t('authRemoveNote') }) : null, _jsx(Row, { id: "dsb-auth-id", label: t('authId'), hint: t('authIdHint'), invalid: !!idRefused, problem: idRefused ? t(idRefused) : undefined, labels: rowLabels(t), wide: true, children: editing ? _jsx("code", { children: props.id }) : _jsx(TextInput, { id: "dsb-auth-id", value: id, invalid: !!idRefused, disabled: props.disabled, placeholder: "work-portal", code: true, onChange: setId }) }), _jsxs(Row, { id: "dsb-auth-domains", label: t('authDomains'), hint: t('authDomainsHint'), invalid: domains.length === 0, problem: t('authDomainsEmpty'), labels: rowLabels(t), wide: true, children: [_jsx(Chips, { id: "dsb-auth-domains", values: domains, disabled: props.disabled, placeholder: "example.com", addLabel: t('authDomains'), removeLabel: t('remove'), onChange: setDomains, check: value => { const refused = domainProblem(value); return refused ? t(refused) : undefined; } }), privateDomains.length ? _jsx("p", { className: css.rowHint, role: "note", children: t('authDomainPrivate') }) : null] }), _jsx(Row, { label: t('authPersist'), hint: t('authPersistHint'), help: t('authPersistHelp'), labels: rowLabels(t), inline: true, children: _jsx(Toggle, { label: t('authPersist'), checked: persist, disabled: props.disabled, onChange: setPersist }) }), _jsxs(Row, { label: t('authPath'), hint: t('authPathHint'), labels: rowLabels(t), wide: true, children: [_jsx("code", { "data-dsb-auth-path": true, className: "dsb-preview", children: path ?? t('authPathUnknown') }), _jsx("p", { className: css.rowHint, children: t('authPathRule') })] })] });
}
/** The login profiles: a row each, an edit dialog, and an add button. */
function ProfileList({ card }) {
    const { t } = card;
    const { profiles, ids, disabled, report, policy } = useProfiles(card);
    const [dialog, setDialog] = useState();
    const effective = new Map((report?.authProfiles ?? []).map(profile => [profile.id, profile]));
    const overlayOnly = (report?.authProfiles ?? []).filter(profile => profile.origin === 'overlay-created' && !(profile.id in profiles));
    const origin = (value) => value === 'overlay-changed' ? t('authOriginChanged') : value === 'overlay-created' ? t('authOriginCreated') : '';
    const row = (id, entry, overlayCreated = false) => {
        const live = effective.get(id);
        const domains = live && live.origin !== 'baseline' ? live.allowedDomains : entry.allowedDomains;
        const persistState = live && live.origin !== 'baseline' ? live.persistState : entry.persistState;
        return _jsx(Item, { data: id, title: _jsx("code", { children: id }), badges: _jsxs(_Fragment, { children: [_jsx(Badge, { tone: "neutral", children: fill(t('authDomainsCount'), { n: domains.length }) }), _jsx(Badge, { tone: persistState ? 'info' : 'outline', children: persistState ? t('authPersistOn') : t('authPersistOff') }), live && live.origin !== 'baseline' ? _jsx(Badge, { tone: "warning", children: origin(live.origin) }) : null] }), meta: overlayCreated ? t('authOverlayOnly') : domains.join(', ') || '—', actions: _jsxs(_Fragment, { children: [live && live.origin !== 'baseline' ? _jsx("button", { type: "button", className: css.link, disabled: policy.busy, onClick: () => void card.clearPolicyOverlay('authProfile', id), children: t('authRevert') }) : null, overlayCreated ? null : _jsx(Btn, { disabled: disabled, onClick: () => setDialog({ id }), data: "auth-edit", children: t('edit') })] }) }, id);
    };
    return _jsxs(Row, { field: "authProfiles", label: t('authProfiles'), hint: t('authProfilesHint'), help: t('authProfilesHelp'), labels: rowLabels(t), wide: true, children: [_jsxs("div", { className: css.list, "data-dsb-profiles": true, children: [ids.length === 0 && overlayOnly.length === 0 ? _jsx("p", { className: css.empty, children: t('authProfilesEmpty') }) : null, ids.map(id => row(id, profiles[id])), overlayOnly.map(profile => row(profile.id, { storageStatePath: profile.storageStatePath ?? '', allowedDomains: profile.allowedDomains, persistState: profile.persistState }, true))] }), _jsx("div", { children: _jsx(Btn, { disabled: disabled, onClick: () => setDialog({}), data: "auth-add", children: t('authAdd') }) }), dialog ? _jsx(ProfileDialog, { card: card, id: dialog.id, entry: dialog.id ? profiles[dialog.id] : undefined, existing: ids, authDir: report?.authDir, disabled: disabled, onClose: () => setDialog(undefined) }, dialog.id ?? '\u0000new') : null] });
}
/** The default profile, picked from the list above (a stored name that is not in it is shown as missing). */
function DefaultProfileRow({ card }) {
    const { t } = card;
    const { ids } = useProfiles(card);
    const field = useField(card, 'defaultAuthProfile');
    const id = controlId('defaultAuthProfile');
    const current = field.state.text;
    const missing = current !== '' && !ids.includes(current);
    return _jsx(Row, { field: "defaultAuthProfile", id: id, label: t('defaultAuthProfile'), hint: t('defaultAuthProfileHint'), overridden: field.state.overridden, invalid: field.state.invalid || missing, problem: missing ? `${current} ${t('defaultAuthProfileMissing')}` : t('invalid'), disabled: field.disabled, labels: rowLabels(t), onReset: field.reset, children: _jsx(Select, { id: id, value: current === '' ? '__none__' : current, muted: !field.state.overridden, invalid: missing, disabled: field.disabled, options: [{ value: '__none__', label: t('defaultAuthProfileNone') }, ...ids.map(entry => ({ value: entry, label: entry }))], onChange: value => field.edit(value === '__none__' ? '' : value) }) });
}
/** What agents changed on top of this page's settings: a status line, the change log in a dialog, and the way back to the baseline. */
function OverlayRows({ card }) {
    const { t } = card;
    const state = card.usePolicyStatus(snapshot => snapshot);
    const saving = card.useBrowserSettings(snapshot => snapshot.saving);
    const { refreshPolicyStatus } = card;
    useEffect(() => { if (!saving)
        refreshPolicyStatus(); }, [saving, refreshPolicyStatus]);
    const [open, setOpen] = useState(false);
    const report = state.report;
    const origin = (value) => t({ baseline: 'policyOriginBaseline', 'overlay-changed': 'policyOriginChanged', 'overlay-created': 'policyOriginCreated' }[value]);
    const direction = (value) => t({ tighten: 'policyTightened', loosen: 'policyLoosened', none: 'policyUnchanged' }[value]);
    const usage = report ? Object.entries(report.usagePolicy).filter(([, entry]) => entry.overridden) : [];
    return _jsxs("div", { "data-dsb-policy": true, children: [_jsxs(Row, { label: t('policyOverlay'), hint: t('policyOverlayHint'), help: t('policyOverlayHelp'), labels: rowLabels(t), wide: true, children: [_jsxs("div", { className: css.item, "data-dsb-policy-status": true, children: [_jsxs("div", { className: css.itemMain, children: [_jsx("div", { className: css.itemTitle, "data-dsh-browser-policy-revision": true, children: state.loading && !report ? t('promptsLoading') : state.failed ? t('policyUnavailable') : report?.overlayActive ? _jsx(Badge, { tone: "warning", children: fill(t('policyOverlayActive'), { n: report.revision }) }) : _jsx("span", { className: css.muted, children: t('policyOverlayIdle') }) }), report?.warning ? _jsx("div", { className: "dsb-bad", role: "alert", "data-dsh-browser-policy-warning": true, children: report.warning }) : null] }), _jsxs("div", { className: css.itemActions, children: [_jsx(Btn, { onClick: () => setOpen(true), data: "policy-audit", children: t('policyAuditOpen') }), _jsx(Btn, { disabled: state.busy || !report || (!report.overlayActive && !report.warning), onClick: () => void card.clearPolicyOverlay('all'), data: "policy-clear", children: t('policyClearAll') })] })] }), state.error ? _jsx("p", { className: "dsb-bad", role: "alert", children: state.error }) : null] }), _jsx(Dialog, { open: open, wide: true, title: t('policyAuditTitle'), closeLabel: t('close'), onClose: () => setOpen(false), footer: _jsx(Btn, { primary: true, onClick: () => setOpen(false), children: t('close') }), children: report ? _jsxs(_Fragment, { children: [_jsxs("p", { className: css.rowHint, "data-dsh-browser-policy-meta": true, children: [t('policyRevision'), " ", report.revision, report.updatedAt ? ` · ${new Date(report.updatedAt).toLocaleString()}` : '', " \u00B7 ", report.overlayActive ? t('policyActive') : t('policyInactive'), " \u00B7 ", t('policyAuthDirLabel'), ": ", _jsx("code", { children: report.authDir })] }), report.warning ? _jsx("p", { className: "dsb-bad", role: "alert", children: report.warning }) : null, _jsx(SubHead, { children: t('policyProfiles') }), report.authProfiles.length
                            ? _jsx("div", { className: css.list, "data-dsh-browser-policy-profiles": true, children: report.authProfiles.map(profile => _jsx(Item, { data: profile.id, title: _jsx("code", { children: profile.id }), badges: _jsx(Badge, { tone: profile.origin === 'baseline' ? 'outline' : 'warning', children: origin(profile.origin) }), meta: `${profile.allowedDomains.join(', ')} · persistState=${String(profile.persistState)}` }, profile.id)) })
                            : _jsx("p", { className: css.empty, children: t('policyNoProfiles') }), report.removedByOverlay.length ? _jsxs("p", { className: css.rowHint, "data-dsh-browser-policy-removed": true, children: [t('policyRemovedLabel'), ": ", report.removedByOverlay.join(', ')] }) : null, usage.length ? _jsxs(_Fragment, { children: [_jsx(SubHead, { children: t('policyUsageEffective') }), _jsx("div", { className: css.list, "data-dsh-browser-policy-usage": true, children: usage.map(([key, entry]) => _jsx(Item, { title: _jsxs("code", { children: [key, " = ", entry.value] }), meta: `${t('policyBaselineWas')} ${entry.baseline}` }, key)) })] }) : null, _jsx(SubHead, { children: t('policyAudit') }), report.audit.length
                            ? _jsx("div", { className: css.list, "data-dsh-browser-policy-audit": true, children: [...report.audit].reverse().map(entry => _jsx(Item, { title: _jsxs(_Fragment, { children: ["r", entry.revision, " \u00B7 ", entry.action, " ", _jsx(Badge, { tone: entry.direction === 'loosen' ? 'warning' : entry.direction === 'tighten' ? 'success' : 'outline', children: direction(entry.direction) })] }), meta: _jsxs(_Fragment, { children: [new Date(entry.at).toLocaleString(), " \u00B7 ", entry.source, entry.session ? ` ${entry.session}` : '', " \u00B7 ", entry.reason, entry.changes.length ? ` — ${entry.changes.join('; ')}` : ''] }) }, entry.revision)) })
                            : _jsx("p", { className: css.empty, children: t('policyNoAudit') }), _jsx("p", { className: css.rowHint, children: t('policyUnrestrictedNote') })] }) : _jsx("p", { className: css.empty, children: state.failed ? t('policyUnavailable') : t('promptsLoading') }) })] });
}
export function AccessGroup({ card }) {
    const { t } = card;
    const count = useOverriddenCount(card, [...ACCESS_FIELDS, 'authProfiles']);
    return _jsxs(Group, { id: "access", title: t('groupAccess'), summary: t('groupAccessSub'), badges: count ? _jsx(Badge, { tone: "info", children: fill(t('overriddenCount'), { n: count }) }) : null, children: [_jsx(ProfileList, { card: card }), _jsx(DefaultProfileRow, { card: card }), _jsx(SwitchRow, { card: card, name: "allowPrivateHosts", risk: t('riskNote') }), _jsx(OverlayRows, { card: card }), _jsx(Fold, { id: "access-legacy", title: t('browserAdvanced'), children: _jsx(TextRow, { card: card, name: "storageStatePath", code: true }) })] });
}
//# sourceMappingURL=group-access.js.map