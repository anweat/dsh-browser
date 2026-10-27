import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
/**
 * "Prompts": the text the model reads, as a list. A row per text (name, default or overridden, length) and an Edit
 * dialog that puts the default text beside your override; the per-entry overrides (groups, actions, error hints) are a
 * list of only the entries you changed, with their own dialog. The budget summary stays on top and the default text can be
 * exported, as commented YAML or plain JSON.
 *
 * Every edit stages into the one `prompts` draft the page's Save writes (see form.ts); a dialog's own Save only stages.
 * @module dsh-browser/client/group-prompts
 */
import { useEffect, useState } from 'react';
import { SegmentedControl } from '@deepseek-ai/dsh-client-ui-primitives';
import { PROMPT_LIMITS } from "../prompt-limits.js";
import { fill, rowLabels } from "./field-rows.js";
import { PROMPT_EXTRA_KEYS, PROMPT_TEXT_FIELDS } from "./prompts-form.js";
import { styles as css } from "./styles.js";
import { Badge, Btn, Dialog, Fold, Group, Item, Row, Select, SubHead, TextInput, Toggle } from "./ui-kit.js";
/** Label and hint keys of each text, by id. */
const TEXT_LABELS = {
    indexDescription: { label: 'promptsIndexDescription', hint: 'promptsIndexDescriptionHint' },
    callDescription: { label: 'promptsCallDescription', hint: 'promptsCallDescriptionHint' },
    rootGuide: { label: 'promptsRootGuide', hint: 'promptsRootGuideHint' },
    rootNote: { label: 'promptsRootNote', hint: 'promptsRootNoteHint' },
    skillDescription: { label: 'promptsSkillDescription', hint: 'promptsSkillDescriptionHint' },
    skillBodyFile: { label: 'promptsSkillBodyFile', hint: 'promptsSkillBodyFileHint' },
    skillAppend: { label: 'promptsSkillAppend', hint: 'promptsSkillAppendHint' },
};
const KIND_LABELS = { groups: 'promptKindGroups', actions: 'promptKindActions', errorHints: 'promptKindErrorHints' };
function usePrompts(card) {
    const state = card.useBrowserSettings(snapshot => snapshot.prompts);
    const disabled = card.useBrowserSettings(snapshot => !snapshot.writable);
    const status = card.usePromptsStatus(snapshot => snapshot);
    return { state, disabled, status, defaults: status.defaultTexts };
}
/** The budget line and the diagnostics, from what the running plugin reports. */
function StatusLine({ card }) {
    const { t } = card;
    const { status, state } = usePrompts(card);
    const { refreshPromptsStatus } = card;
    const saving = card.useBrowserSettings(snapshot => snapshot.saving);
    // Refresh when the group renders and after each save settles: that is when what is in effect can have changed.
    useRefreshAfterSave(saving, refreshPromptsStatus);
    const report = status.status;
    const count = report?.overrides.length ?? 0;
    return _jsxs("div", { className: css.item, role: "status", "data-dsh-browser-prompts-status": true, children: [_jsxs("div", { className: css.itemMain, children: [_jsx("div", { className: css.itemTitle, "data-dsh-browser-prompts-budget": true, children: report ? fill(t('promptsStatusLine'), { l0: report.budget.l0Tokens, l0Budget: report.budget.l0Budget, layer: report.budget.largestLayer.name, tokens: report.budget.largestLayer.tokens, layerBudget: report.budget.layerBudget })
                            : status.failed ? t('promptsStatusUnavailable2') : t('promptsLoading') }), _jsxs("div", { className: css.itemMeta, children: [report ? (count ? fill(t('promptsStatusOverrides'), { n: count }) : t('promptsStatusNone')) : '', state.invalid ? ` · ${t('invalid')}` : ''] }), report?.diagnostics.length ? _jsx(Fold, { id: "prompts-diagnostics", title: fill(t('promptsStatusDiagnostics'), { n: report.diagnostics.length }), hint: t('promptsDiagnosticsFold'), children: _jsx("ul", { "data-dsh-browser-prompts-diagnostics": true, children: report.diagnostics.map((entry, index) => _jsx("li", { children: entry.message }, index)) }) }) : null] }), _jsx("div", { className: css.itemActions, children: _jsx("button", { type: "button", className: css.link, onClick: refreshPromptsStatus, children: t('promptsRefresh') }) })] });
}
function useRefreshAfterSave(saving, refresh) {
    useEffect(() => { if (!saving)
        refresh(); }, [saving, refresh]);
}
/** One text: the default beside your override. Save only stages. */
function TextDialog({ card, id, onClose }) {
    const { t } = card;
    const { state, disabled, defaults } = usePrompts(card);
    const spec = PROMPT_TEXT_FIELDS.find(entry => entry.id === id);
    const labels = TEXT_LABELS[id];
    const base = defaults?.texts[id];
    const hasDefault = id !== 'skillBodyFile' && id !== 'skillAppend';
    const [draft, setDraft] = useState(state.texts[id].text);
    const tooLong = draft.length > spec.limit;
    const same = base !== undefined && draft === base;
    const inputId = `plugin-config-dsh-browser-prompts-${id}`;
    return _jsx(Dialog, { open: true, wide: true, title: fill(t('promptEditTitle'), { name: t(labels.label) }), closeLabel: t('close'), description: t(labels.hint), onClose: onClose, footer: _jsxs(_Fragment, { children: [hasDefault && base !== undefined ? _jsx(Btn, { disabled: disabled || draft === base, onClick: () => setDraft(base), data: "prompt-start", children: t('promptStart') }) : null, _jsx(Btn, { disabled: disabled || draft === '', onClick: () => setDraft(''), data: "prompt-restore", children: t('promptRestore') }), _jsx(Btn, { onClick: onClose, data: "prompt-cancel", children: t('cancel') }), _jsx(Btn, { primary: true, disabled: disabled || tooLong, onClick: () => { card.editPromptText(id, draft); onClose(); }, data: "prompt-save", children: t('promptSave') })] }), children: _jsxs("div", { className: css.compare, children: [_jsxs("div", { className: css.compareCol, children: [_jsx("strong", { children: t('promptDefaultCol') }), _jsx("pre", { className: css.preview, "data-dsb-prompt-default": true, children: hasDefault ? base ?? t('promptDefaultMissing') : t('promptNoDefault') })] }), _jsxs("div", { className: css.compareCol, children: [_jsx("label", { htmlFor: inputId, children: t('promptMineCol') }), spec.multiline
                            ? _jsx("textarea", { id: inputId, className: `${css.input} ${css.textarea} ${css.code} ${tooLong ? css.invalidInput : ''}`, rows: 12, spellCheck: false, value: draft, disabled: disabled, placeholder: t('promptEmptyIsDefault'), "aria-invalid": tooLong || undefined, onChange: event => setDraft(event.currentTarget.value) })
                            : _jsx(TextInput, { id: inputId, value: draft, code: true, disabled: disabled, invalid: tooLong, placeholder: t('promptEmptyIsDefault'), onChange: setDraft }), _jsxs("p", { className: tooLong ? `${css.rowHint} dsb-bad` : css.rowHint, role: tooLong ? 'alert' : undefined, children: [tooLong ? t('promptsTooLong') : same ? t('promptSameAsDefault') : '', " (", draft.length, "/", spec.limit, ")"] })] })] }) });
}
/** The seven texts as a list. */
function TextList({ card }) {
    const { t } = card;
    const { state, disabled } = usePrompts(card);
    const [editing, setEditing] = useState();
    return _jsxs(_Fragment, { children: [_jsx(SubHead, { children: t('promptsListTitle') }), _jsx("p", { className: css.rowHint, children: t('promptsListHint') }), _jsx("div", { className: css.list, "data-dsb-prompt-list": true, children: PROMPT_TEXT_FIELDS.map(spec => {
                    const entry = state.texts[spec.id];
                    const overridden = entry.text !== '' && !entry.sameAsDefault;
                    return _jsx(Item, { data: spec.id, title: t(TEXT_LABELS[spec.id].label), badges: _jsxs(_Fragment, { children: [_jsx(Badge, { tone: overridden ? 'info' : 'outline', children: overridden ? t('promptStateOverridden') : t('promptStateDefault') }), entry.text !== '' ? _jsx(Badge, { tone: entry.invalid ? 'danger' : 'neutral', children: fill(t('promptChars'), { n: entry.text.length }) }) : null] }), meta: t(TEXT_LABELS[spec.id].hint), actions: _jsxs(_Fragment, { children: [entry.text !== '' ? _jsx("button", { type: "button", className: css.link, disabled: disabled, onClick: () => card.editPromptText(spec.id, ''), children: t('promptRestore') }) : null, _jsx(Btn, { disabled: disabled, onClick: () => setEditing(spec.id), data: "prompt-edit", children: t('edit') })] }) }, spec.id);
                }) }), editing ? _jsx(TextDialog, { card: card, id: editing, onClose: () => setEditing(undefined) }, editing) : null] });
}
/** One entry of the groups / actions / errorHints lists. */
function EntryDialog({ card, entry, onClose }) {
    const { t } = card;
    const { disabled, defaults } = usePrompts(card);
    const [kind, setKind] = useState(entry?.kind ?? 'actions');
    const [key, setKey] = useState(entry?.key ?? '');
    const [summary, setSummary] = useState(entry?.summary ?? '');
    const [notes, setNotes] = useState(entry?.notes ?? '');
    const [text, setText] = useState(entry?.text ?? '');
    const known = defaults?.extras[kind];
    const base = known?.[key];
    const baseSummary = typeof base === 'object' && base !== null ? base.summary : undefined;
    const baseNotes = typeof base === 'object' && base !== null ? base.notes : undefined;
    const baseText = typeof base === 'string' ? base : undefined;
    const keyProblem = key !== '' && !/^[A-Za-z0-9_.-]+$/.test(key);
    const unknown = key !== '' && !keyProblem && defaults !== undefined && !(key in (known ?? {}));
    const caps = { summary: PROMPT_LIMITS.summary, notes: PROMPT_LIMITS.topicText, text: PROMPT_LIMITS.errorHint };
    const over = (kind !== 'errorHints' && (summary.length > caps.summary || notes.length > caps.notes)) || (kind === 'errorHints' && text.length > caps.text);
    const complete = key !== '' && !keyProblem && !over && (kind === 'errorHints' ? text !== '' : summary !== '' || (kind === 'actions' && notes !== ''));
    const save = () => {
        card.setPromptExtra(kind, key, kind === 'errorHints' ? text : kind === 'groups' ? { summary } : { summary, notes });
        onClose();
    };
    const field = (label, id, value, set, cap, defaultText, rows) => _jsxs("div", { className: css.compare, children: [_jsxs("div", { className: css.compareCol, children: [_jsxs("strong", { children: [label, " \u00B7 ", t('promptDefaultCol')] }), _jsx("pre", { className: css.preview, children: defaultText ?? t('promptNoDefault') })] }), _jsxs("div", { className: css.compareCol, children: [_jsxs("label", { htmlFor: id, children: [label, " \u00B7 ", t('promptMineCol')] }), _jsx("textarea", { id: id, className: `${css.input} ${css.textarea} ${value.length > cap ? css.invalidInput : ''}`, rows: rows, spellCheck: false, value: value, disabled: disabled, placeholder: t('promptEmptyIsDefault'), onChange: event => set(event.currentTarget.value) }), _jsxs("p", { className: value.length > cap ? `${css.rowHint} dsb-bad` : css.rowHint, children: ["(", value.length, "/", cap, ")"] })] })] }, id);
    return _jsxs(Dialog, { open: true, wide: true, title: entry ? fill(t('promptEntryEditTitle'), { key: entry.key }) : t('promptEntryNewTitle'), closeLabel: t('close'), onClose: onClose, footer: _jsxs(_Fragment, { children: [entry ? _jsx(Btn, { danger: true, disabled: disabled, onClick: () => { card.setPromptExtra(entry.kind, entry.key, undefined); onClose(); }, data: "entry-remove", children: t('promptEntryRemove') }) : null, _jsx(Btn, { onClick: onClose, data: "entry-cancel", children: t('cancel') }), _jsx(Btn, { primary: true, disabled: disabled || !complete, onClick: save, data: "entry-save", children: t('promptSave') })] }), children: [_jsx(Row, { id: "dsb-entry-kind", label: t('promptEntryKind'), hint: t('promptEntryKindHint'), labels: rowLabels(t), children: entry ? _jsx(Badge, { tone: "neutral", children: t(KIND_LABELS[kind]) })
                    : _jsx(Select, { id: "dsb-entry-kind", value: kind, disabled: disabled, options: PROMPT_EXTRA_KEYS.map(value => ({ value, label: t(KIND_LABELS[value]) })), onChange: value => setKind(value) }) }), _jsxs(Row, { id: "dsb-entry-key", label: t('promptEntryKey'), hint: t('promptEntryKeyHint'), invalid: keyProblem, problem: t('promptEntryKeyInvalid'), labels: rowLabels(t), children: [entry ? _jsx("code", { children: entry.key }) : _jsxs(_Fragment, { children: [_jsx(TextInput, { id: "dsb-entry-key", value: key, list: "dsb-entry-keys", code: true, disabled: disabled, invalid: keyProblem, placeholder: kind === 'errorHints' ? 'DEADLINE' : kind === 'groups' ? 'act' : 'act.click', onChange: setKey }), _jsx("datalist", { id: "dsb-entry-keys", children: Object.keys(known ?? {}).map(name => _jsx("option", { value: name }, name)) })] }), unknown ? _jsx("p", { className: css.rowHint, role: "note", children: t('promptEntryUnknown') }) : null] }), kind === 'errorHints'
                ? field(t('promptEntryText'), 'dsb-entry-text', text, setText, caps.text, baseText, 6)
                : _jsxs(_Fragment, { children: [field(t('promptEntrySummary'), 'dsb-entry-summary', summary, setSummary, caps.summary, baseSummary, 3), kind === 'actions' ? field(t('promptEntryNotes'), 'dsb-entry-notes', notes, setNotes, caps.notes, baseNotes, 8) : null] })] });
}
/** The entries you changed. */
function EntryList({ card }) {
    const { t } = card;
    const { state, disabled } = usePrompts(card);
    const [dialog, setDialog] = useState();
    return _jsxs(_Fragment, { children: [_jsx(SubHead, { children: t('promptsEntriesTitle') }), _jsx("p", { className: css.rowHint, children: t('promptsEntriesHint') }), _jsxs("div", { className: css.list, "data-dsb-entry-list": true, children: [state.entries.length === 0 ? _jsx("p", { className: css.empty, children: t('promptsEntriesEmpty') }) : null, state.entries.map(entry => _jsx(Item, { data: `${entry.kind}:${entry.key}`, title: _jsx("code", { children: entry.key }), badges: _jsx(Badge, { tone: "neutral", children: t(KIND_LABELS[entry.kind]) }), meta: entry.summary ?? entry.text ?? entry.notes, actions: _jsx(Btn, { disabled: disabled, onClick: () => setDialog({ entry }), data: "entry-edit", children: t('edit') }) }, `${entry.kind}:${entry.key}`))] }), _jsx("div", { children: _jsx(Btn, { disabled: disabled, onClick: () => setDialog({}), data: "entry-add", children: t('promptsEntryAdd') }) }), dialog ? _jsx(EntryDialog, { card: card, entry: dialog.entry, onClose: () => setDialog(undefined) }, dialog.entry ? `${dialog.entry.kind}:${dialog.entry.key}` : '\u0000new') : null] });
}
/** The default text, commented YAML or JSON, to copy. */
function ExportDialog({ card, onClose }) {
    const { t } = card;
    const { status } = usePrompts(card);
    const [form, setForm] = useState('yaml');
    const [copied, setCopied] = useState(false);
    const lang = t('lang');
    const { exportPromptDefaults, exportPromptYaml } = card;
    useEffect(() => { void exportPromptDefaults(); void exportPromptYaml(lang); }, [exportPromptDefaults, exportPromptYaml, lang]);
    const shown = form === 'yaml' ? (status.defaultsYaml?.lang === lang ? status.defaultsYaml.text : undefined) : status.defaults;
    const failed = form === 'yaml' ? status.yamlFailed : status.defaultsFailed;
    return _jsxs(Dialog, { open: true, wide: true, title: t('promptExportTitle'), closeLabel: t('close'), description: t('promptExportHint'), onClose: onClose, footer: _jsxs(_Fragment, { children: [_jsx(Btn, { disabled: shown === undefined, onClick: () => { void navigator.clipboard?.writeText(shown ?? '').then(() => setCopied(true)).catch(() => undefined); }, data: "export-copy", children: copied ? t('promptExportCopied') : t('promptExportCopy') }), _jsx(Btn, { primary: true, onClick: onClose, children: t('close') })] }), children: [_jsx(SegmentedControl, { id: "dsb-export-form", label: t('promptExportTitle'), value: form, onChange: next => { setForm(next); setCopied(false); }, options: [{ value: 'yaml', label: t('promptExportYaml') }, { value: 'json', label: t('promptExportJson') }] }), failed ? _jsx("p", { className: "dsb-bad", role: "alert", children: t('promptExportFailed') })
                : _jsx("textarea", { className: `${css.input} ${css.textarea} ${css.code}`, rows: 16, readOnly: true, spellCheck: false, "aria-label": t('promptExportTitle'), value: shown ?? t('promptExportLoading'), onFocus: event => event.currentTarget.select(), "data-dsh-browser-prompts-defaults": true })] });
}
export function PromptsGroup({ card }) {
    const { t } = card;
    const { state, disabled } = usePrompts(card);
    const [exporting, setExporting] = useState(false);
    const overridden = state.overridden;
    return _jsxs(Group, { id: "prompts", title: t('groupPrompts'), summary: t('groupPromptsSub'), badges: overridden ? _jsx(Badge, { tone: "info", children: t('overridden') }) : null, children: [_jsxs("div", { className: css.stack, "data-dsb-field": "prompts", "data-dsh-browser-prompts": true, children: [_jsx(StatusLine, { card: card }), _jsx(Row, { label: t('promptsSkillEnabled'), hint: t('promptsSkillEnabledHint'), labels: rowLabels(t), inline: true, children: _jsx(Toggle, { label: t('promptsSkillEnabled'), checked: state.skillEnabled, disabled: disabled, onChange: card.setPromptSkillEnabled }) }), _jsx(TextList, { card: card }), _jsx(EntryList, { card: card }), _jsx("div", { "data-dsh-browser-prompts-export": true, children: _jsx(Btn, { onClick: () => setExporting(true), data: "export-open", children: t('promptExportOpen') }) }), _jsx("p", { className: css.notice, role: "note", children: t('promptsRestart') })] }), exporting ? _jsx(ExportDialog, { card: card, onClose: () => setExporting(false) }) : null] });
}
//# sourceMappingURL=group-prompts.js.map