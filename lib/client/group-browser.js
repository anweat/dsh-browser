import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * "Browser": which engine runs and how. Four everyday choices up front; the rest folded under "Advanced".
 * @module dsh-browser/client/group-browser
 */
import { controlId, fill, NumberRow, SelectRow, SwitchRow, TextRow, rowLabels, useField, useOverriddenCount } from "./field-rows.js";
import { Badge, Chips, Fold, Group, Row } from "./ui-kit.js";
export const BROWSER_FIELDS = ['browserRuntime', 'channel', 'headless', 'autoInstall', 'executablePath', 'cdpPort', 'maxSessions', 'args', 'snapshotDir', 'verbose'];
/** The Chromium launch arguments as chips; the staged text is a JSON array (or empty). */
function ArgsRow({ card }) {
    const { t } = card;
    const field = useField(card, 'args');
    let values = [];
    try {
        const parsed = field.state.text.trim() === '' ? [] : JSON.parse(field.state.text);
        if (Array.isArray(parsed))
            values = parsed.filter((entry) => typeof entry === 'string');
    }
    catch { /* shown as invalid by the row */ }
    return _jsx(Row, { field: "args", id: controlId('args'), label: t('args'), hint: t('argsHint'), help: t('argsHelp'), overridden: field.state.overridden, invalid: field.state.invalid, problem: t('invalid'), disabled: field.disabled, labels: rowLabels(t), onReset: field.reset, children: _jsx(Chips, { id: controlId('args'), values: values, disabled: field.disabled, placeholder: t('argsPlaceholder'), addLabel: t('args'), removeLabel: t('remove'), onChange: next => field.edit(next.length ? JSON.stringify(next) : '') }) });
}
export function BrowserGroup({ card }) {
    const { t } = card;
    const count = useOverriddenCount(card, BROWSER_FIELDS);
    return _jsxs(Group, { id: "browser", title: t('groupBrowser'), summary: t('groupBrowserSub'), badges: count ? _jsx(Badge, { tone: "info", children: fill(t('overriddenCount'), { n: count }) }) : null, children: [_jsx(SelectRow, { card: card, name: "browserRuntime", options: [{ value: 'playwright', label: 'playwright' }, { value: 'patchright', label: 'patchright' }] }), _jsx(SelectRow, { card: card, name: "channel", options: [{ value: 'chromium', label: 'chromium' }, { value: 'chrome', label: 'chrome' }, { value: 'msedge', label: 'msedge' }] }), _jsx(SwitchRow, { card: card, name: "headless" }), _jsx(SwitchRow, { card: card, name: "autoInstall" }), _jsxs(Fold, { id: "browser-advanced", title: t('browserAdvanced'), hint: t('browserAdvancedHint'), children: [_jsx(TextRow, { card: card, name: "executablePath", code: true }), _jsx(NumberRow, { card: card, name: "cdpPort" }), _jsx(NumberRow, { card: card, name: "maxSessions" }), _jsx(ArgsRow, { card: card }), _jsx(TextRow, { card: card, name: "snapshotDir", code: true }), _jsx(SwitchRow, { card: card, name: "verbose" })] })] });
}
//# sourceMappingURL=group-browser.js.map