import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * "Downloads": where files land and how large one may be. The size is stored in bytes; the control shows the largest
 * unit that divides it exactly, so 104857600 reads as "100 MiB".
 * @module dsh-browser/client/group-downloads
 */
import { useState } from 'react';
import { controlId, fill, rowLabels, TextRow, useField, useOverriddenCount } from "./field-rows.js";
import { Badge, Group, Row, Select, TextInput } from "./ui-kit.js";
import { SIZE_UNITS, bytesToUnitText, unitFor, unitTextToBytes } from "./size-units.js";
export const DOWNLOAD_FIELDS = ['downloadDir', 'downloadMaxBytes'];
function MaxBytesRow({ card }) {
    const { t } = card;
    const field = useField(card, 'downloadMaxBytes');
    const bytes = field.state.text.trim() === '' ? undefined : Number(field.state.text);
    const [unit, setUnit] = useState();
    // Until the person picks a unit, show the one that fits the stored value; typing never changes it under their hands.
    const shown = unit ?? unitFor(bytes);
    const [draft, setDraft] = useState();
    /** What a typed text stages: its bytes, or the text itself when it is not a positive number (the field is then invalid and the save refused). */
    const stagedFor = (nextText, nextUnit) => { const result = unitTextToBytes(nextText, nextUnit); return result === undefined ? nextText : String(result); };
    // The typed text is shown while it is what is staged; a discard or a reset elsewhere brings the stored value back.
    const text = draft !== undefined && stagedFor(draft, shown) === field.state.text ? draft : bytes !== undefined && Number.isFinite(bytes) ? bytesToUnitText(bytes, shown) : '';
    const id = controlId('downloadMaxBytes');
    const apply = (nextText, nextUnit) => field.edit(stagedFor(nextText, nextUnit));
    return _jsx(Row, { field: "downloadMaxBytes", id: id, label: t('downloadMaxBytes'), hint: t('downloadMaxBytesHint'), help: t('downloadMaxBytesHelp'), overridden: field.state.overridden, invalid: field.state.invalid, problem: t('invalid'), disabled: field.disabled, labels: rowLabels(t), onReset: () => { setDraft(undefined); setUnit(undefined); field.reset(); }, children: _jsxs("span", { className: "dsb-unit-input", children: [_jsx(TextInput, { id: id, value: text, numeric: true, placeholder: "100", muted: !field.state.overridden, invalid: field.state.invalid, disabled: field.disabled, onChange: value => { setUnit(shown); setDraft(value); apply(value, shown); } }), _jsx(Select, { ariaLabel: t('downloadMaxBytes'), value: shown, disabled: field.disabled, options: SIZE_UNITS.map(([name]) => ({ value: name, label: name })), onChange: value => { const next = value; setUnit(next); setDraft(text); apply(text, next); } })] }) });
}
export function DownloadsGroup({ card }) {
    const { t } = card;
    const count = useOverriddenCount(card, DOWNLOAD_FIELDS);
    return _jsxs(Group, { id: "downloads", title: t('groupDownloads'), summary: t('groupDownloadsSub'), badges: count ? _jsx(Badge, { tone: "info", children: fill(t('overriddenCount'), { n: count }) }) : null, children: [_jsx(TextRow, { card: card, name: "downloadDir", placeholder: "$DSH_HOME/data/browser/downloads", code: true }), _jsx(MaxBytesRow, { card: card })] });
}
//# sourceMappingURL=group-downloads.js.map