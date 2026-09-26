import { Fragment as _Fragment, jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * The browser settings card, as the Plugins page renders it.
 *
 * The page owns the card frame — its title button, disclosure, and artwork come
 * from the slot registration — so this component renders only what goes inside:
 * the one-liner for `view: 'summary'`, and the form body for `view: 'page'`.
 * Drawing our own frame here produced a doubled card and an inner header button
 * that swallowed the platform's clicks.
 *
 * The form chrome is the shared `SettingsForm`/`SettingsValueField` pair from
 * `@deepseek-ai/dsh-client-ui-primitives`, the same components every official
 * settings page uses, so the card matches them without restating their markup.
 * @module dsh-browser/client/SettingsCard
 */
import { useEffect, useState } from 'react';
import { SettingsForm, SettingsValueField } from '@deepseek-ai/dsh-client-ui-primitives';
import { FIELD_SPECS, JSON_FIELD_SPECS, JSON_FIELDS } from "./form.js";
import { styles as css } from "./styles.js";
/** The copy the shared form frame renders, from this page's dictionary. */
function formLabels(t) {
    return {
        unavailable: t('unavailable'),
        readOnly: t('readOnly'),
        saveFailed: t('saveFailed'),
        save: t('save'),
        saving: t('saving'),
    };
}
const SECTION_LAYOUT = [
    { title: 'freedom', hint: 'freedomHint', fields: ['enabled', 'automationMode', 'opencliEnabled'] },
    { title: 'runtime', hint: 'runtimeHint', fields: ['browserRuntime', 'channel', 'headless', 'autoInstall', 'executablePath', 'cdpPort'] },
    { title: 'advanced', hint: 'advancedHint', fields: ['storageStatePath', 'defaultAuthProfile', 'snapshotDir', 'verbose'] },
];
/** The section field a spec names, when it is one of the single-input fields. */
function sectionField(field) {
    return FIELD_SPECS.some(spec => spec.field === field) ? field : undefined;
}
export function SettingsCard(props) {
    const { t } = props;
    const state = props.useBrowserSettings(snapshot => snapshot);
    // The one-liner the Plugins list shows. Without it the list falls back to the
    // package's npm description, which reads like a styling bug and is not one.
    if (props.view === 'summary')
        return _jsx(_Fragment, { children: t('description') });
    const disabled = !state.writable;
    // Single-input fields live in `state.fields`; the JSON-shaped ones are read
    // from the model directly, because the card renders them as code editors
    // rather than one-line inputs.
    const numeric = new Set(['cdpPort']);
    const field = (spec) => {
        const known = sectionField(spec.field);
        const fieldState = known ? state.fields[known] : state.jsonFields[spec.field];
        return _jsx(SettingsValueField, { id: `plugin-config-dsh-browser-${spec.field}`, label: t(spec.field), hint: t(`${spec.field}Hint`), overriddenLabel: t('overridden'), resetLabel: t('reset'), invalidLabel: t(JSON_FIELDS.has(spec.field) ? 'invalidJson' : 'invalidNumber'), numeric: numeric.has(spec.field), disabled: disabled, ...fieldState, onEdit: text => props.edit(spec.field, text), onReset: () => props.resetField(spec.field) }, spec.field);
    };
    return _jsxs(SettingsForm, { labels: formLabels(t), state: state, onSave: props.save, onDiscard: props.discard, children: [SECTION_LAYOUT.map(section => _jsxs("section", { className: css.section, children: [_jsxs("div", { className: css.sectionHead, children: [_jsx("h3", { children: t(section.title) }), _jsx("p", { children: t(section.hint) })] }), _jsx("div", { className: css.grid, children: section.fields.map(name => field(FIELD_SPECS.find(spec => spec.field === name))) })] }, section.title)), _jsxs("section", { className: css.section, children: [_jsxs("div", { className: css.sectionHead, children: [_jsx("h3", { children: t('usage') }), _jsx("p", { children: t('usageHint') })] }), _jsx("div", { className: css.grid, children: JSON_FIELD_SPECS.map(spec => field(spec)) }), _jsx("p", { className: css.notice, role: "note", children: t('restart') })] }), _jsx(AutomationAssetsPanel, { ...props })] });
}
function AutomationAssetsPanel(props) {
    const { t } = props;
    const state = props.useAutomationAssets(snapshot => snapshot);
    const [draft, setDraft] = useState('');
    const [draftError, setDraftError] = useState(false);
    const [testUrl, setTestUrl] = useState('');
    const [testInputs, setTestInputs] = useState('{}');
    const selected = state.selected;
    useEffect(() => { if (selected)
        setDraft(JSON.stringify(selected, null, 2)); }, [selected?.id, selected?.revision]);
    const newAsset = (kind) => {
        props.selectAutomationAsset(undefined);
        const value = kind === 'recipe'
            ? { kind, name: 'New recipe', description: '', domains: [], tags: [], inputNames: [], recipe: [{ type: 'extract', selector: 'main', mode: 'text', limit: 20 }] }
            : { kind, name: 'New userscript', description: '', domains: [], tags: [], inputNames: [], source: '// ==UserScript==\n// @name New userscript\n// @match https://example.com/*\n// @grant none\n// ==/UserScript==\nreturn { title: document.title }' };
        setDraft(JSON.stringify(value, null, 2));
        setDraftError(false);
    };
    const save = async () => {
        try {
            const value = JSON.parse(draft);
            if (selected?.id)
                value.id = selected.id;
            await props.saveAutomationAsset(value);
            setDraftError(false);
        }
        catch {
            setDraftError(true);
        }
    };
    const runTest = async () => {
        if (!selected || !testUrl.trim()) {
            setDraftError(true);
            return;
        }
        try {
            const inputs = JSON.parse(testInputs);
            await props.testAutomationAsset(selected.id, testUrl.trim(), inputs);
            setDraftError(false);
        }
        catch {
            setDraftError(true);
        }
    };
    const candidates = state.snapshot?.candidates.filter(candidate => candidate.suggestedAt && !candidate.dismissedAt) ?? [];
    const assets = state.snapshot?.assets ?? [];
    return _jsxs("section", { className: css.section, "data-dsh-browser-assets": true, children: [_jsxs("div", { className: css.sectionHead, children: [_jsx("h3", { children: t('assetLibrary') }), _jsx("p", { children: t('assetLibraryHint') })] }), state.loading ? _jsx("p", { className: css.notice, children: t('assetLoading') }) : null, state.failed ? _jsx("p", { className: css.failed, role: "alert", children: state.error || t('assetFailed') }) : null, candidates.length ? _jsxs("div", { className: css.assetGroup, children: [_jsx("h4", { children: t('assetSuggestions') }), candidates.map(candidate => _jsxs("article", { className: css.assetRow, children: [_jsxs("div", { children: [_jsx("strong", { children: candidate.title }), _jsxs("p", { children: [candidate.domain, " \u00B7 ", candidate.successfulRuns, " ", t('assetRuns'), " \u00B7 ", candidate.distinctSessions, " ", t('assetSessions')] })] }), _jsxs("div", { className: css.actions, children: [_jsx("button", { type: "button", className: css.secondary, disabled: state.busy, onClick: () => props.dismissAutomationCandidate(candidate.id), children: t('assetDismiss') }), _jsx("button", { type: "button", className: css.primary, disabled: state.busy, onClick: () => props.summarizeAutomationCandidate(candidate.id), children: t('assetSummarize') })] })] }, candidate.id))] }) : null, _jsxs("div", { className: css.assetToolbar, children: [_jsxs("div", { children: [_jsx("strong", { children: t('assetScripts') }), _jsx("p", { className: css.hint, children: t('assetScriptsHint') })] }), _jsxs("div", { className: css.actions, children: [_jsx("button", { type: "button", className: css.secondary, onClick: () => newAsset('recipe'), children: t('assetNewRecipe') }), _jsx("button", { type: "button", className: css.secondary, onClick: () => newAsset('userscript'), children: t('assetNewScript') }), _jsx("button", { type: "button", className: css.secondary, onClick: props.refreshAutomationAssets, children: t('assetRefresh') })] })] }), _jsxs("div", { className: css.assetLayout, children: [_jsx("div", { className: css.assetList, children: assets.length ? assets.map(asset => _jsxs("button", { type: "button", className: `${css.assetItem} ${selected?.id === asset.id ? css.assetSelected : ''}`, onClick: () => props.selectAutomationAsset(asset.id), children: [_jsxs("span", { children: [_jsx("strong", { children: asset.name }), _jsxs("small", { children: [asset.kind, " \u00B7 ", asset.status, " \u00B7 r", asset.revision] })] }), _jsx("span", { className: css.assetTest, children: asset.testStatus })] }, asset.id)) : _jsx("p", { className: css.hint, children: t('assetEmpty') }) }), _jsxs("div", { className: css.assetEditor, children: [_jsx("label", { className: css.label, htmlFor: "dsh-browser-asset-editor", children: t('assetEditor') }), _jsx("textarea", { id: "dsh-browser-asset-editor", className: `${css.input} ${css.textarea} ${css.code} ${draftError ? css.invalidInput : ''}`, rows: 18, value: draft, spellCheck: false, placeholder: t('assetEditorHint'), onChange: event => { setDraft(event.currentTarget.value); setDraftError(false); } }), _jsx("p", { className: css.hint, children: draftError ? t('assetInvalid') : t('assetSourceBoundary') }), selected?.status === 'draft' ? _jsxs("div", { className: css.assetTestForm, children: [_jsx("input", { className: css.input, value: testUrl, placeholder: t('assetTestUrl'), onChange: event => setTestUrl(event.currentTarget.value) }), _jsx("textarea", { className: `${css.input} ${css.textarea} ${css.code}`, rows: 3, value: testInputs, spellCheck: false, "aria-label": t('assetTestInputs'), onChange: event => setTestInputs(event.currentTarget.value) })] }) : null, _jsxs("div", { className: css.actions, children: [selected ? _jsx("button", { type: "button", className: css.secondary, disabled: state.busy, onClick: () => props.validateAutomationAsset(selected.id), children: t('assetValidate') }) : null, selected?.status === 'draft' ? _jsx("button", { type: "button", className: css.secondary, disabled: state.busy || !testUrl.trim(), onClick: () => void runTest(), children: t('assetTest') }) : null, selected?.status === 'draft' ? _jsx("button", { type: "button", className: css.secondary, disabled: state.busy || selected.testStatus !== 'passed', onClick: () => props.setAutomationAssetStatus(selected.id, 'active'), children: t('assetActivate') }) : null, selected && selected.status !== 'archived' ? _jsx("button", { type: "button", className: css.secondary, disabled: state.busy, onClick: () => props.setAutomationAssetStatus(selected.id, 'archived'), children: t('assetArchive') }) : null, _jsx("button", { type: "button", className: css.primary, disabled: state.busy || !draft || selected?.status === 'active', onClick: () => void save(), children: t('assetSaveDraft') })] })] })] })] });
}
//# sourceMappingURL=SettingsCard.js.map