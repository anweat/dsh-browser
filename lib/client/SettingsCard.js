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
import { useEffect } from 'react';
import { SettingsForm, SettingsValueField } from '@deepseek-ai/dsh-client-ui-primitives';
import { ASSET_POLICY_KEYS, USAGE_POLICY_KEYS } from "../policy-keys.js";
import { CONFIG_FILE_ONLY_FIELDS, FIELD_SPECS, JSON_FIELDS } from "./form.js";
import { PROMPT_TEXT_FIELDS } from "./prompts-form.js";
import { styles as css } from "./styles.js";
import { credentialView, identicalOutputPairs, inputSetLines, isDirty, shortHash } from "./asset-editor.js";
import { inputSetShortfall } from "../activation-rules.js";
/** Fill `{name}` placeholders of a dictionary entry. */
const fill = (text, values) => text.replace(/\{(\w+)\}/g, (_match, key) => String(values[key] ?? ''));
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
/**
 * Which fields each section shows, by field name, and which public fields it only names ("edit in the config file").
 * A public config field missing from here and from the prompt/usage sections would be silently absent from the card;
 * test/settings-card-render.test.ts renders the card and checks every Config field is a control or a note.
 */
const SECTION_LAYOUT = [
    { title: 'freedom', hint: 'freedomHint', fields: ['enabled', 'automationMode', 'toolSurface', 'opencliEnabled'] },
    { title: 'runtime', hint: 'runtimeHint', fields: ['browserRuntime', 'channel', 'headless', 'autoInstall', 'executablePath', 'cdpPort', 'maxSessions', 'args'] },
    { title: 'advanced', hint: 'advancedHint', fields: ['storageStatePath', 'defaultAuthProfile', 'snapshotDir', 'verbose'], notes: CONFIG_FILE_ONLY_FIELDS },
];
/** The usage section's JSON boxes. */
const USAGE_FIELDS = ['usagePolicy', 'automationAssets'];
/** The keys each JSON policy box accepts, generated from the code's own lists so the hint cannot leave one out. */
const POLICY_KEY_LISTS = { usagePolicy: USAGE_POLICY_KEYS, automationAssets: ASSET_POLICY_KEYS };
/** The single-input fields, where `state.fields` holds their state. */
const SINGLE_INPUT_FIELDS = new Set(FIELD_SPECS.map(spec => spec.field));
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
    const numeric = new Set(['cdpPort', 'maxSessions']);
    const field = (name) => {
        const fieldState = SINGLE_INPUT_FIELDS.has(name) ? state.fields[name] : state.jsonFields[name];
        const policyKeys = POLICY_KEY_LISTS[name];
        return _jsx(SettingsValueField, { id: `plugin-config-dsh-browser-${name}`, label: t(name), hint: policyKeys ? `${t(`${name}Hint`)} ${t('policyKeys')} ${policyKeys.join(', ')}` : t(`${name}Hint`), overriddenLabel: t('overridden'), resetLabel: t('reset'), invalidLabel: t(JSON_FIELDS.has(name) ? 'invalidJson' : 'invalidNumber'), numeric: numeric.has(name), disabled: disabled, ...fieldState, onEdit: text => props.edit(name, text), onReset: () => props.resetField(name) }, name);
    };
    /** A public field with no form: its name, what it is for, and where to edit it. */
    const configFileNote = (name) => _jsxs("div", { className: css.field, "data-dsh-browser-config-note": name, children: [_jsx("div", { className: css.fieldHead, children: _jsx("span", { className: css.label, children: t(name) }) }), _jsxs("p", { className: css.hint, children: [t(`${name}Hint`), " ", t('configFileOnly')] })] }, name);
    return _jsxs(SettingsForm, { labels: formLabels(t), state: state, onSave: props.save, onDiscard: props.discard, children: [SECTION_LAYOUT.map(section => _jsxs("section", { className: css.section, children: [_jsxs("div", { className: css.sectionHead, children: [_jsx("h3", { children: t(section.title) }), _jsx("p", { children: t(section.hint) })] }), _jsxs("div", { className: css.grid, children: [section.fields.map(name => field(name)), section.notes?.map(name => configFileNote(name))] })] }, section.title)), _jsxs("section", { className: css.section, children: [_jsxs("div", { className: css.sectionHead, children: [_jsx("h3", { children: t('usage') }), _jsx("p", { children: t('usageHint') })] }), _jsx("div", { className: css.grid, children: USAGE_FIELDS.map(name => field(name)) }), _jsx("p", { className: css.notice, role: "note", children: t('restart') })] }), _jsx(PromptsPanel, { ...props, disabled: disabled }), _jsx(AutomationAssetsPanel, { ...props })] });
}
/** Label and hint keys of each text control, by field id. */
const PROMPT_LABELS = {
    indexDescription: { label: 'promptsIndexDescription', hint: 'promptsIndexDescriptionHint' },
    callDescription: { label: 'promptsCallDescription', hint: 'promptsCallDescriptionHint' },
    rootGuide: { label: 'promptsRootGuide', hint: 'promptsRootGuideHint' },
    rootNote: { label: 'promptsRootNote', hint: 'promptsRootNoteHint' },
    skillDescription: { label: 'promptsSkillDescription', hint: 'promptsSkillDescriptionHint' },
    skillBodyFile: { label: 'promptsSkillBodyFile', hint: 'promptsSkillBodyFileHint' },
    skillAppend: { label: 'promptsSkillAppend', hint: 'promptsSkillAppendHint' },
};
/**
 * The "prompt text" section: the text the model reads, overridable. The controls are views of one staged `prompts`
 * draft that saves with the rest of the form; the status block below shows what the running plugin reports about it.
 */
function PromptsPanel(props) {
    const { t, disabled } = props;
    const settings = props.useBrowserSettings(snapshot => snapshot);
    const status = props.usePromptsStatus(snapshot => snapshot);
    const { refreshPromptsStatus } = props;
    // Refresh when the page opens and after each save settles: that is when what is in effect can have changed.
    useEffect(() => { if (!settings.saving)
        refreshPromptsStatus(); }, [settings.saving, refreshPromptsStatus]);
    const prompts = settings.prompts;
    const report = status.status;
    const text = (id) => {
        const spec = PROMPT_TEXT_FIELDS.find(entry => entry.id === id);
        const state = prompts.texts[id];
        const labels = PROMPT_LABELS[id];
        const inputId = `plugin-config-dsh-browser-prompts-${id}`;
        const common = { id: inputId, className: `${css.input} ${state.invalid ? css.invalidInput : ''}`, value: state.text, disabled, 'aria-invalid': state.invalid || undefined, onChange: (value) => props.editPromptText(id, value) };
        return _jsxs("div", { className: css.field, children: [_jsxs("div", { className: css.fieldHead, children: [_jsx("label", { className: css.label, htmlFor: inputId, children: t(labels.label) }), state.text ? _jsx("button", { type: "button", className: css.reset, disabled: disabled, onClick: () => props.editPromptText(id, ''), children: t('promptsReset') }) : null] }), spec.multiline
                    ? _jsx("textarea", { ...common, className: `${common.className} ${css.textarea}`, rows: id === 'rootNote' ? 3 : 5, spellCheck: false, onChange: event => common.onChange(event.currentTarget.value) })
                    : _jsx("input", { ...common, type: "text", onChange: event => common.onChange(event.currentTarget.value) }), _jsxs("p", { className: state.invalid ? css.failed : css.hint, children: [state.invalid ? t('promptsTooLong') : t(labels.hint), spec.limit > 1024 || state.text ? ` (${state.text.length}/${spec.limit})` : ''] })] }, id);
    };
    const budgetLine = report ? `${t('promptsL0')}: ~${report.budget.l0Tokens} ${t('promptsTokens')} (${t('promptsBudget')} ${report.budget.l0Budget}) · ${t('promptsLargest')}: ${report.budget.largestLayer.name} ~${report.budget.largestLayer.tokens} (${t('promptsBudget')} ${report.budget.layerBudget})` : '';
    return _jsxs("section", { className: css.section, "data-dsh-browser-prompts": true, children: [_jsxs("div", { className: css.sectionHead, children: [_jsx("h3", { children: t('prompts') }), _jsx("p", { children: t('promptsHint') })] }), _jsxs("div", { className: css.grid, children: [text('indexDescription'), text('callDescription'), text('rootGuide'), text('rootNote')] }), _jsxs("div", { className: css.grid, children: [_jsx("div", { className: css.field, children: _jsxs("label", { className: css.toggleLabel, children: [_jsx("input", { type: "checkbox", className: css.check, checked: prompts.skillEnabled, disabled: disabled, onChange: event => props.setPromptSkillEnabled(event.currentTarget.checked) }), _jsxs("span", { children: [_jsx("span", { className: css.label, children: t('promptsSkillEnabled') }), _jsx("p", { className: css.hint, children: t('promptsSkillEnabledHint') })] })] }) }), text('skillDescription'), text('skillBodyFile'), text('skillAppend')] }), _jsxs("div", { className: css.field, children: [_jsxs("div", { className: css.fieldHead, children: [_jsx("label", { className: css.label, htmlFor: "plugin-config-dsh-browser-prompts-extras", children: t('promptsExtras') }), prompts.extras.text ? _jsx("button", { type: "button", className: css.reset, disabled: disabled, onClick: props.resetPromptExtras, children: t('promptsExtrasReset') }) : null] }), _jsx("textarea", { id: "plugin-config-dsh-browser-prompts-extras", className: `${css.input} ${css.textarea} ${css.code} ${prompts.extras.invalid ? css.invalidInput : ''}`, rows: 10, spellCheck: false, disabled: disabled, "aria-invalid": prompts.extras.invalid || undefined, value: prompts.extras.text, onChange: event => props.editPromptExtras(event.currentTarget.value) }), _jsx("p", { className: prompts.extras.invalid ? css.failed : css.hint, role: prompts.extras.invalid ? 'alert' : undefined, children: prompts.extras.invalid ? t('promptsExtrasInvalid') : t('promptsExtrasHint') })] }), _jsxs("div", { className: css.notice, role: "status", "data-dsh-browser-prompts-status": true, children: [_jsx("strong", { children: t('promptsStatus') }), ' ', _jsx("button", { type: "button", className: css.reset, onClick: refreshPromptsStatus, children: t('promptsRefresh') }), status.loading && !report ? _jsx("p", { children: t('promptsLoading') }) : null, status.failed ? _jsx("p", { children: t('promptsStatusUnavailable') }) : null, report ? _jsxs(_Fragment, { children: [_jsx("p", { "data-dsh-browser-prompts-budget": true, children: budgetLine }), _jsx("p", { children: report.overrides.length ? `${report.overrides.length} ${t('promptsOverrides')}: ${report.overrides.map(entry => entry.length === undefined ? entry.key : `${entry.key} (${entry.length})`).join(', ')}` : t('promptsNoOverrides') }), _jsxs("p", { children: [t('promptsDiagnostics'), ": ", report.diagnostics.length ? '' : t('promptsNoDiagnostics')] }), report.diagnostics.length ? _jsx("ul", { "data-dsh-browser-prompts-diagnostics": true, children: report.diagnostics.map((entry, index) => _jsx("li", { children: entry.message }, index)) }) : null] }) : null] }), _jsxs("div", { className: css.field, "data-dsh-browser-prompts-export": true, children: [_jsxs("div", { className: css.fieldHead, children: [_jsx("span", { className: css.label, children: t('promptsDefaults') }), status.defaults === undefined
                                ? _jsx("button", { type: "button", className: css.secondary, onClick: () => void props.exportPromptDefaults(), children: t('promptsExport') })
                                : _jsxs("span", { className: css.actions, children: [_jsx("button", { type: "button", className: css.secondary, onClick: () => { void navigator.clipboard?.writeText(status.defaults ?? '').catch(() => undefined); }, children: t('promptsCopy') }), _jsx("button", { type: "button", className: css.secondary, onClick: props.hidePromptDefaults, children: t('promptsHideDefaults') })] })] }), status.defaults !== undefined
                        ? _jsx("textarea", { className: `${css.input} ${css.textarea} ${css.code}`, rows: 12, readOnly: true, spellCheck: false, "aria-label": t('promptsDefaults'), value: status.defaults, onFocus: event => event.currentTarget.select(), "data-dsh-browser-prompts-defaults": true })
                        : null, status.defaultsFailed ? _jsx("p", { className: css.failed, role: "alert", children: t('promptsDefaultsFailed') }) : _jsx("p", { className: css.hint, children: t('promptsDefaultsHint') })] }), _jsx("p", { className: css.notice, role: "note", children: t('promptsRestart') })] });
}
function AutomationAssetsPanel(props) {
    const { t } = props;
    const state = props.useAutomationAssets(snapshot => snapshot);
    const { editor, selected } = state;
    const dirty = isDirty(editor.text, editor.baseline);
    const credentials = credentialView(selected);
    const draft = selected?.status === 'draft';
    // Leaving the page with edits in the textarea would lose them silently.
    useEffect(() => {
        if (!dirty)
            return undefined;
        const guard = (event) => { event.preventDefault(); event.returnValue = ''; };
        window.addEventListener('beforeunload', guard);
        return () => window.removeEventListener('beforeunload', guard);
    }, [dirty]);
    const candidates = state.snapshot?.candidates.filter(candidate => candidate.suggestedAt && !candidate.dismissedAt) ?? [];
    const assets = state.snapshot?.assets ?? [];
    const noticeLabel = (kind) => t({ json: 'assetNoticeJson', backend: 'assetNoticeBackend', validation: 'assetNoticeValidation', refused: 'assetNoticeRefused' }[kind]);
    // Unsaved edits, or a brand-new draft that was never saved: the button saves what is on screen, then tests exactly that revision.
    const saveFirst = dirty || !selected;
    const latest = credentials.latest;
    const sets = latest?.revision === selected?.revision ? inputSetLines(latest) : [];
    const suspect = latest && sets.length ? identicalOutputPairs(latest) : [];
    const required = state.snapshot?.policy.minInputSetsForActivation ?? 1;
    // A passed test that is too narrow: activation would be refused, and this says why before the click.
    const shortfall = selected && draft && credentials.vouches ? inputSetShortfall(selected, credentials.current, required) : undefined;
    const shortfallText = shortfall ? fill(t('assetNeedsInputSets'), { required: shortfall.required, covered: shortfall.covered }) : '';
    const convertible = !!selected && selected.kind === 'recipe' && (selected.schemaVersion ?? 1) === 1;
    return _jsxs("section", { className: css.section, "data-dsh-browser-assets": true, children: [_jsxs("div", { className: css.sectionHead, children: [_jsx("h3", { children: t('assetLibrary') }), _jsx("p", { children: t('assetLibraryHint') })] }), state.loading ? _jsx("p", { className: css.notice, children: t('assetLoading') }) : null, state.failed ? _jsx("p", { className: css.failed, role: "alert", children: state.error || t('assetFailed') }) : null, candidates.length ? _jsxs("div", { className: css.assetGroup, children: [_jsx("h4", { children: t('assetSuggestions') }), candidates.map(candidate => _jsxs("article", { className: css.assetRow, children: [_jsxs("div", { children: [_jsx("strong", { children: candidate.title }), _jsxs("p", { children: [candidate.domain, " \u00B7 ", candidate.successfulRuns, " ", t('assetRuns'), " \u00B7 ", candidate.distinctSessions, " ", t('assetSessions')] })] }), _jsxs("div", { className: css.actions, children: [_jsx("button", { type: "button", className: css.secondary, disabled: state.busy, onClick: () => props.dismissAutomationCandidate(candidate.id), children: t('assetDismiss') }), _jsx("button", { type: "button", className: css.primary, disabled: state.busy, onClick: () => props.summarizeAutomationCandidate(candidate.id), children: t('assetSummarize') })] })] }, candidate.id))] }) : null, _jsxs("div", { className: css.assetToolbar, children: [_jsxs("div", { children: [_jsx("strong", { children: t('assetScripts') }), _jsx("p", { className: css.hint, children: t('assetScriptsHint') })] }), _jsxs("div", { className: css.actions, children: [_jsx("button", { type: "button", className: css.secondary, onClick: () => props.requestNewAutomationAsset('recipe'), children: t('assetNewRecipe') }), _jsx("button", { type: "button", className: css.secondary, onClick: () => props.requestNewAutomationAsset('userscript'), children: t('assetNewScript') }), _jsx("button", { type: "button", className: css.secondary, onClick: props.requestRefreshAutomationAssets, children: t('assetRefresh') })] })] }), editor.confirm ? _jsxs("div", { className: css.failed, role: "alertdialog", "aria-label": t('assetLeaveTitle'), "data-dsh-browser-leave": true, children: [_jsx("p", { children: t('assetLeaveTitle') }), _jsxs("div", { className: css.actions, children: [_jsx("button", { type: "button", className: css.secondary, onClick: props.cancelLeaveAutomationAsset, children: t('assetLeaveKeep') }), _jsx("button", { type: "button", className: css.primary, onClick: props.confirmLeaveAutomationAsset, children: t('assetLeaveConfirm') })] })] }) : null, _jsxs("div", { className: css.assetLayout, children: [_jsx("div", { className: css.assetList, children: assets.length ? assets.map(asset => _jsxs("button", { type: "button", className: `${css.assetItem} ${selected?.id === asset.id ? css.assetSelected : ''}`, onClick: () => props.requestSelectAutomationAsset(asset.id), children: [_jsxs("span", { children: [_jsx("strong", { children: asset.name }), _jsxs("small", { children: [asset.kind, " \u00B7 ", asset.status, " \u00B7 r", asset.revision] })] }), _jsx("span", { className: css.assetTest, children: asset.testStatus })] }, asset.id)) : _jsx("p", { className: css.hint, children: t('assetEmpty') }) }), _jsxs("div", { className: css.assetEditor, children: [_jsxs("label", { className: css.label, htmlFor: "dsh-browser-asset-editor", children: [t('assetEditor'), dirty ? _jsxs(_Fragment, { children: [" \u00B7 ", _jsx("span", { "data-dsh-browser-dirty": true, children: t('assetEditorDirtyBadge') })] }) : null] }), selected ? _jsxs("div", { className: css.hint, "data-dsh-browser-version": true, children: [_jsxs("p", { children: [t('assetRevision'), " r", selected.revision, " \u00B7 ", t('assetHash'), " ", _jsx("code", { children: shortHash(selected.contentHash) }), " \u00B7 ", selected.status, selected.sourceAssetId ? _jsxs(_Fragment, { children: [" \u00B7 ", t('assetDerivedFrom'), " ", selected.sourceAssetId.slice(0, 8), " r", selected.sourceRevision] }) : null] }), credentials.latest ? _jsxs("p", { "data-dsh-browser-credential": true, children: [t('assetLastTest'), ": r", credentials.latest.revision, " \u00B7 ", _jsx("code", { children: shortHash(credentials.latest.contentHash) }), " \u00B7 ", credentials.latest.passed ? t('assetPassed') : t('assetNotPassed'), " (", credentials.latest.executionStatus, "/", credentials.latest.validationStatus, ", ", credentials.latest.evidenceLevel, credentials.latest.legacy ? ', legacy' : '', ") \u00B7 ", new Date(credentials.latest.testedAt).toLocaleString(), " \u00B7 ", t('assetInputsDigest'), " ", credentials.latest.inputsDigest, credentials.latest.revision !== selected.revision ? _jsxs(_Fragment, { children: [" \u00B7 ", t('assetStaleTest')] }) : null] }) : null, selected.status === 'draft' && !credentials.vouches ? _jsx("p", { children: t('assetNoTest') }) : null, sets.length ? _jsxs("div", { "data-dsh-browser-sets": true, children: [_jsxs("p", { children: [t('assetInputSets'), latest?.plannedSets && latest.plannedSets > sets.length ? ` (${t('assetSetsRan')} ${sets.length}/${latest.plannedSets})` : ''] }), _jsx("ul", { children: sets.map(line => _jsxs("li", { "data-dsh-browser-set": line.set, children: [t('assetInputSet'), " ", line.set, " ", t('assetInputSetUnit'), " \u00B7 ", line.passed ? t('assetPassed') : t('assetNotPassed'), " (", line.status, ") \u00B7 ", t('assetInputsDigest'), " ", _jsx("code", { children: line.inputsDigest })] }, line.set)) })] }) : null, suspect.length ? _jsx("p", { className: css.failed, role: "note", "data-dsh-browser-suspect": true, children: fill(t('assetSuspect'), { pairs: suspect.map(pair => pair.join('/')).join('; ') }) }) : null, selected.pendingDisambiguation?.length ? _jsx("p", { "data-dsh-browser-pending": true, children: fill(t('assetPending'), { n: selected.pendingDisambiguation.length }) }) : null] }) : null, editor.converted ? _jsxs("div", { className: css.notice, role: "status", "data-dsh-browser-converted": true, children: [_jsx("p", { children: fill(t('assetConverted'), { name: editor.converted.sourceName }) }), _jsx("ul", { children: editor.converted.notes.map((note, index) => _jsx("li", { children: note }, index)) })] }) : null, _jsx("textarea", { id: "dsh-browser-asset-editor", "aria-label": t('assetEditor'), className: `${css.input} ${css.textarea} ${css.code} ${editor.notice?.kind === 'json' ? css.invalidInput : ''}`, rows: 18, value: editor.text, spellCheck: false, disabled: state.busy, placeholder: t('assetEditorHint'), onChange: event => props.editAutomationAsset(event.currentTarget.value) }), editor.notice ? _jsxs("p", { className: css.failed, role: "alert", "data-dsh-browser-notice": editor.notice.kind, children: [noticeLabel(editor.notice.kind), editor.notice.message, editor.notice.code ? ` [${editor.notice.code}]` : ''] }) : _jsx("p", { className: css.hint, children: dirty ? t('assetUnsaved') : t('assetSourceBoundary') }), draft || !selected ? _jsxs("div", { className: css.assetTestForm, children: [_jsx("input", { className: css.input, value: editor.testUrl, "aria-label": t('assetTestUrl'), placeholder: t('assetTestUrl'), onChange: event => props.setAssetTestUrl(event.currentTarget.value) }), _jsx("textarea", { className: `${css.input} ${css.textarea} ${css.code}`, rows: 3, value: editor.testInputs, spellCheck: false, "aria-label": t('assetTestInputs'), onChange: event => props.setAssetTestInputs(event.currentTarget.value) })] }) : null, shortfall ? _jsx("p", { className: css.hint, role: "note", "data-dsh-browser-activation-hint": true, children: shortfallText }) : null, _jsxs("div", { className: css.actions, children: [selected ? _jsx("button", { type: "button", className: css.secondary, disabled: state.busy || dirty, onClick: () => props.validateAutomationAsset(selected.id), children: t('assetValidate') }) : null, draft || !selected ? _jsx("button", { type: "button", className: css.secondary, disabled: state.busy || !editor.testUrl.trim() || !editor.text, onClick: () => void props.saveAndTestAutomationAsset(), children: saveFirst ? t('assetSaveAndTest') : t('assetTest') }) : null, draft ? _jsxs("button", { type: "button", className: css.secondary, disabled: state.busy || dirty || !credentials.vouches || !!shortfall, title: dirty ? t('assetActivateNeedsSave') : shortfallText || undefined, onClick: () => void props.activateAutomationAsset(), children: [t('assetActivate'), " r", selected.revision] }) : null, convertible ? _jsx("button", { type: "button", className: css.secondary, disabled: state.busy, onClick: () => props.requestConvertAutomationAsset(selected.id), children: t('assetConvert') }) : null, selected && selected.status !== 'draft' ? _jsx("button", { type: "button", className: css.secondary, disabled: state.busy, onClick: () => props.requestForkAutomationAsset(selected.id), children: t('assetFork') }) : null, selected && selected.status !== 'archived' ? _jsx("button", { type: "button", className: css.secondary, disabled: state.busy, onClick: () => props.setAutomationAssetStatus(selected.id, 'archived'), children: t('assetArchive') }) : null, _jsx("button", { type: "button", className: css.primary, disabled: state.busy || !editor.text || selected?.status === 'active', onClick: () => void props.saveEditedAutomationAsset(), children: t('assetSaveDraft') })] })] })] })] });
}
//# sourceMappingURL=SettingsCard.js.map