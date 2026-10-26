import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * "Advanced: text mode": the default parameters as one commented `key = value` text, for people who prefer to read and
 * edit them that way. It is a view of the controls above, not a second place the settings live: editing the text stages
 * the same fields, and editing a control prints the text again. Every key has a comment in front of it (what it is for,
 * the allowed values, the default, the risk); comment lines are ignored when the text is read.
 * @module dsh-browser/client/group-advanced
 */
import { useEffect, useState } from 'react';
import { CONFIG_FILE_ONLY_FIELDS } from "./form.js";
import { rowLabels } from "./field-rows.js";
import { styles as css } from "./styles.js";
import { Btn, Group, Row } from "./ui-kit.js";
/** A public field the card has no form for, on purpose: its name, what it is for, and where to edit it. */
function ConfigFileNote({ card, name }) {
    const { t } = card;
    return _jsxs("div", { className: css.field, "data-dsh-browser-config-note": name, children: [_jsx("div", { className: css.fieldHead, children: _jsx("span", { className: css.label, children: t(name) }) }), _jsxs("p", { className: css.hint, children: [t(`${name}Hint`), " ", t('configFileOnly')] })] });
}
export function AdvancedGroup({ card }) {
    const { t } = card;
    const view = card.useBrowserSettings(snapshot => snapshot.properties);
    const disabled = card.useBrowserSettings(snapshot => !snapshot.writable);
    const [copied, setCopied] = useState(false);
    const lang = t('lang');
    const { setPropertyLanguage } = card;
    useEffect(() => { setPropertyLanguage(lang); }, [lang, setPropertyLanguage]);
    const errors = view.issues.filter(issue => issue.level === 'error');
    const warnings = view.issues.filter(issue => issue.level === 'warning');
    const id = 'plugin-config-dsh-browser-properties';
    return _jsx(Group, { id: "advanced", title: t('groupAdvanced'), summary: t('groupAdvancedSub'), children: _jsxs("div", { className: css.stack, "data-dsh-browser-properties": true, children: [_jsxs(Row, { id: id, label: t('propertiesEditor'), hint: t('advancedHint'), labels: rowLabels(t), wide: true, children: [_jsx("textarea", { id: id, className: `${css.input} ${css.textarea} ${css.code} ${errors.length ? css.invalidInput : ''}`, rows: 26, spellCheck: false, "data-dsb-mirror": true, disabled: disabled, "aria-invalid": errors.length > 0 || undefined, value: view.text, onChange: event => { setCopied(false); card.editProperties(event.currentTarget.value); } }), errors.length ? _jsx("ul", { className: css.failed, role: "alert", "data-dsh-browser-properties-errors": true, children: errors.map((issue, index) => _jsx("li", { children: issue.message }, index)) }) : null, warnings.length ? _jsx("ul", { className: css.hint, "data-dsh-browser-properties-warnings": true, children: warnings.map((issue, index) => _jsx("li", { children: issue.message }, index)) }) : null, _jsx("p", { className: css.hint, children: t('propertiesFormat') }), _jsx("div", { children: _jsx(Btn, { onClick: () => { void navigator.clipboard?.writeText(view.text).then(() => setCopied(true)).catch(() => undefined); }, data: "properties-copy", children: copied ? t('advancedCopied') : t('advancedCopy') }) })] }), _jsx("p", { className: css.notice, role: "note", children: t('advancedNote') }), CONFIG_FILE_ONLY_FIELDS.map(name => _jsx(ConfigFileNote, { card: card, name: name }, name))] }) });
}
//# sourceMappingURL=group-advanced.js.map