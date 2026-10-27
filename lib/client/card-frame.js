import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * The frame around the groups: the status summary on top (with the warnings dialog) and the save bar at the bottom.
 *
 * The Host's `SettingsForm` offers one save button below the controls. This card needs the bar to stay in view while a
 * long page scrolls, to say how many edits are waiting, and to offer "Discard", so the frame is built here; the
 * behaviors `SettingsForm` has are kept: it says so when the settings are not served or read-only, and it drops the
 * staged edits when the page is left.
 * @module dsh-browser/client/card-frame
 */
import { useEffect, useRef, useState } from 'react';
import { fill } from "./field-rows.js";
import { styles as css } from "./styles.js";
import { Badge, Btn, Dialog } from "./ui-kit.js";
const MODE_TONE = { 'read-only': 'success', standard: 'info', autonomous: 'warning', unrestricted: 'danger' };
/** Everything the "needs attention" badge counts: the warnings the running plugin reported about the configuration, and the overlay warning. */
function useWarnings(card) {
    const report = card.usePolicyStatus(snapshot => snapshot.report);
    return { config: report?.configWarnings ?? [], overlay: report?.warning, overlayActive: report?.overlayActive ?? false, revision: report?.revision };
}
export function SummaryBar({ card }) {
    const { t } = card;
    const [open, setOpen] = useState(false);
    const view = card.useBrowserSettings(snapshot => ({
        enabled: snapshot.fields.enabled.text !== 'false', mode: snapshot.fields.automationMode.text || 'standard',
        surface: snapshot.fields.toolSurface.text || 'indexed', opencli: snapshot.fields.opencliEnabled.text !== 'false',
    }));
    const warnings = useWarnings(card);
    const runtime = card.usePolicyStatus(snapshot => snapshot.runtime);
    const noBrowser = runtime !== undefined && !runtime.browser.ready;
    const opencliMissing = view.opencli && runtime !== undefined && !runtime.opencli.installed;
    // Only "nothing can launch" counts as a warning; a system Chrome standing in, or the optional OpenCLI being absent, are notices.
    const count = warnings.config.length + (warnings.overlay ? 1 : 0) + (noBrowser ? 1 : 0);
    const notices = [
        ...runtime && runtime.browser.ready && runtime.browser.note ? [runtime.browser.note] : [],
        ...opencliMissing && runtime?.opencli.hint ? [runtime.opencli.hint] : [],
    ];
    return _jsxs("div", { className: css.summaryBar, role: "group", "aria-label": t('summaryTitle'), "data-dsb-summary": true, children: [_jsx("strong", { children: t('summaryTitle') }), _jsx(Badge, { tone: view.enabled ? 'success' : 'neutral', children: view.enabled ? t('summaryEnabledOn') : t('summaryEnabledOff') }), _jsxs(Badge, { tone: MODE_TONE[view.mode] ?? 'neutral', children: [t('summaryMode'), " ", view.mode] }), _jsxs(Badge, { tone: "neutral", children: [t('summarySurface'), " ", view.surface] }), _jsx(Badge, { tone: "neutral", children: !view.opencli ? t('summaryOpencliOff') : opencliMissing ? t('summaryOpencliMissing') : t('summaryOpencliOn') }), noBrowser ? _jsx(Badge, { tone: "warning", children: t('summaryNoBrowser') }) : runtime?.browser.source === 'system-browser' ? _jsx(Badge, { tone: "neutral", children: t('summaryBrowserSystem') }) : null, warnings.overlayActive ? _jsx(Badge, { tone: "warning", children: t('summaryOverlay') }) : null, _jsxs("button", { type: "button", className: css.link, onClick: () => setOpen(true), "data-dsb-warnings-count": count, children: [count ? _jsx(Badge, { tone: "warning", children: fill(t('summaryWarnings'), { n: count }) }) : _jsx("span", { className: css.muted, children: t('summaryNoWarnings') }), " \u00B7 ", t('summaryDetails')] }), _jsxs(Dialog, { open: open, title: t('warningsTitle'), closeLabel: t('close'), onClose: () => setOpen(false), footer: _jsx(Btn, { onClick: () => setOpen(false), primary: true, children: t('close') }), children: [count === 0 ? _jsx("p", { className: css.rowHint, children: t('warningsNone') }) : null, noBrowser ? _jsxs("div", { className: css.stack, "data-dsb-runtime-warning": true, children: [_jsx("strong", { children: t('warningsNoBrowser') }), _jsx("p", { className: `${css.rowHint} dsb-bad`, role: "alert", children: runtime?.browser.installAdvice })] }) : null, warnings.config.length ? _jsxs("div", { className: css.stack, "data-dsb-config-warnings": true, children: [_jsx("strong", { children: t('warningsConfig') }), _jsx("ul", { children: warnings.config.map((warning, index) => _jsx("li", { children: warning }, index)) })] }) : null, notices.length ? _jsxs("div", { className: css.stack, "data-dsb-runtime-notices": true, children: [_jsx("strong", { children: t('noticesRuntime') }), _jsx("ul", { children: notices.map((notice, index) => _jsx("li", { children: notice }, index)) })] }) : null, warnings.overlay ? _jsxs("div", { className: css.stack, "data-dsb-policy-warning": true, children: [_jsx("strong", { children: t('warningsOverlay') }), _jsx("p", { className: `${css.rowHint} dsb-bad`, role: "alert", children: warnings.overlay })] }) : null] })] });
}
export function SaveBar({ card }) {
    const { t } = card;
    const state = card.useBrowserSettings(snapshot => snapshot);
    const count = state.changes.length;
    const blocked = !state.dirty || state.invalid || state.saving;
    // The bar floats at the bottom of the window only while there is something to act on (unsaved edits, a save running or failed).
    // Otherwise it sits in the page flow after the last group, so it cannot cover a group heading the user is about to click.
    const floating = state.dirty || state.saving || state.failed;
    return _jsxs("div", { className: css.savebar, role: "region", "aria-label": t('save'), "data-dsb-savebar": true, "data-dsb-floating": floating ? '' : undefined, children: [_jsxs("div", { className: css.saveText, children: [_jsx("span", { "data-dsb-unsaved": count, children: state.invalid ? t('savebarInvalid') : count ? fill(t('savebarDirty'), { n: count }) : t('savebarClean') }), state.failed ? _jsx("span", { className: "dsb-bad", role: "status", children: t('saveFailed') }) : null] }), _jsxs("div", { className: css.actions, children: [_jsx(Btn, { onClick: card.discard, disabled: !state.dirty || state.saving, data: "discard", children: t('discardChanges') }), _jsx(Btn, { primary: true, onClick: card.save, disabled: blocked, data: "save", children: state.saving ? t('saving') : t('save') })] })] });
}
/** The page frame: nothing but a notice while the settings are not served; the staged edits are dropped when the page is left. */
export function Frame({ card, children }) {
    const { t } = card;
    const state = card.useBrowserSettings(snapshot => ({ available: snapshot.available, writable: snapshot.writable }));
    const discard = useRef(card.discard);
    discard.current = card.discard;
    useEffect(() => () => { discard.current(); }, []);
    if (!state.available)
        return _jsx("p", { className: css.notice, role: "status", children: t('unavailable') });
    return _jsxs("div", { className: css.root, "data-dsb-root": true, children: [!state.writable ? _jsx("p", { className: css.notice, role: "status", children: t('readOnly') }) : null, children] });
}
//# sourceMappingURL=card-frame.js.map