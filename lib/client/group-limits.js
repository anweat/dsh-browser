import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * "Usage limits": the call buffer as grouped number inputs with their unit, range and default, and the asset policy
 * in a fold. Each key edits the same staged JSON object the raw box (folded away under "Advanced: raw JSON") shows.
 * @module dsh-browser/client/group-limits
 */
import { SettingsValueField } from '@deepseek-ai/dsh-client-ui-primitives';
import { ASSET_POLICY_KEYS, USAGE_POLICY_KEYS } from "../policy-keys.js";
import { fill, rowLabels, stateOf } from "./field-rows.js";
import { boundsOf, defaultOf, POLICY_SPECS, valueText } from "./policy-fields.js";
import { styles as css } from "./styles.js";
import { Badge, Fold, Group, Help, Row, Select, TextInput, Toggle, UnitInput } from "./ui-kit.js";
const UNIT_KEYS = { ms: 'limitsUnitMs', days: 'limitsUnitDays', tokens: 'limitsUnitTokens', count: 'limitsUnitCount', ratio: 'limitsUnitRatio' };
const SECTION_KEYS = { candidates: 'limitsSectionCandidates', library: 'limitsSectionLibrary', activation: 'limitsSectionActivation' };
const RAW_KEY_LISTS = { usagePolicy: USAGE_POLICY_KEYS, automationAssets: ASSET_POLICY_KEYS };
function PolicyKeyRow({ card, field, spec }) {
    const { t } = card;
    const state = card.useBrowserSettings(snapshot => snapshot.policies[field][spec.key]);
    const disabled = card.useBrowserSettings(snapshot => !snapshot.writable);
    const overlay = card.usePolicyStatus(snapshot => field === 'usagePolicy' ? snapshot.report?.usagePolicy[spec.key] : undefined);
    const id = `plugin-config-dsh-browser-${field}-${spec.key}`;
    const edit = (text) => card.editPolicyKey(field, spec.key, text);
    const range = boundsOf(field, spec.key);
    const fallback = defaultOf(field, spec.key);
    const unit = spec.unit ? t(UNIT_KEYS[spec.unit]) : '';
    const meta = [range ? fill(t('limitsRange'), { min: range[0], max: range[1] }) : '', fallback !== undefined ? fill(t('limitsDefault'), { value: valueText(fallback) }) : '',
        overlay?.overridden ? fill(t('limitsOverlayNote'), { value: overlay.value, baseline: overlay.baseline }) : ''].filter(Boolean).join(' · ');
    const common = { disabled, muted: !state.overridden, invalid: !!state.problem };
    let control;
    switch (spec.kind) {
        case 'bool':
            control = _jsx(Toggle, { label: t(`pk_${spec.key}`), checked: state.text === 'true', disabled: disabled, onChange: next => edit(String(next)) });
            break;
        case 'enum':
            control = _jsx(Select, { id: id, value: state.text, options: (spec.options ?? []).map(value => ({ value, label: value })), ...common, onChange: edit });
            break;
        case 'text':
            control = _jsx(TextInput, { id: id, value: state.text, placeholder: "$DSH_HOME/data/browser/automations", code: true, ...common, onChange: edit });
            break;
        default: control = _jsx(UnitInput, { id: id, value: state.text, unit: unit, ...common, onChange: edit });
    }
    return _jsx(Row, { policyKey: `${field}.${spec.key}`, id: spec.kind === 'bool' ? undefined : id, label: t(`pk_${spec.key}`), hint: t(`pk_${spec.key}Hint`), meta: meta, overridden: state.overridden, invalid: !!state.problem, problem: state.problem ? t(state.problem) : undefined, disabled: disabled, labels: rowLabels(t), onReset: () => edit(''), inline: spec.kind === 'bool', children: control });
}
/** The raw JSON of one policy object, the same data as its rows. */
function RawBox({ card, field, label }) {
    const { t } = card;
    const state = card.useBrowserSettings(snapshot => stateOf(snapshot, field));
    const disabled = card.useBrowserSettings(snapshot => !snapshot.writable);
    return _jsx(SettingsValueField, { id: `plugin-config-dsh-browser-${field}-json`, label: t(label), hint: `${t('limitsRawHint')} ${t('policyKeys')} ${RAW_KEY_LISTS[field].join(', ')}`, overriddenLabel: t('overridden'), resetLabel: t('reset'), invalidLabel: t('invalidJson'), numeric: false, disabled: disabled, ...state, onEdit: text => card.edit(field, text), onReset: () => card.resetField(field) });
}
export function LimitsGroup({ card }) {
    const { t } = card;
    const count = card.useBrowserSettings(snapshot => (Object.values(snapshot.policies.usagePolicy).filter(entry => entry.overridden).length + Object.values(snapshot.policies.automationAssets).filter(entry => entry.overridden).length));
    const sections = ['candidates', 'library', 'activation'];
    return _jsxs(Group, { id: "limits", title: t('groupLimits'), summary: t('groupLimitsSub'), badges: count ? _jsx(Badge, { tone: "info", children: fill(t('overriddenCount'), { n: count }) }) : null, children: [_jsxs("div", { "data-dsb-field": "usagePolicy", children: [_jsxs("div", { className: css.subHead, children: [_jsx("span", { children: t('limitsUsageTitle') }), " ", _jsx(Help, { label: t('helpLabel'), text: t('usagePolicyHelp') })] }), _jsx("p", { className: css.rowHint, children: t('limitsUsageSub') }), POLICY_SPECS.usagePolicy.map(spec => _jsx(PolicyKeyRow, { card: card, field: "usagePolicy", spec: spec }, spec.key))] }), _jsx(Fold, { id: "limits-assets", title: t('limitsAssetsFold'), hint: t('limitsAssetsFoldHint'), children: _jsxs("div", { "data-dsb-field": "automationAssets", children: [_jsx("p", { className: css.rowHint, children: t('automationAssetsHelp') }), sections.map(section => _jsxs("div", { children: [_jsx("div", { className: css.subHead, children: t(SECTION_KEYS[section]) }), POLICY_SPECS.automationAssets.filter(spec => spec.section === section).map(spec => _jsx(PolicyKeyRow, { card: card, field: "automationAssets", spec: spec }, spec.key))] }, section))] }) }), _jsxs(Fold, { id: "limits-raw", title: t('limitsRawFold'), children: [_jsx(RawBox, { card: card, field: "usagePolicy", label: "limitsRawUsage" }), _jsx(RawBox, { card: card, field: "automationAssets", label: "limitsRawAssets" })] }), _jsx("p", { className: css.notice, role: "note", children: t('restart') })] });
}
//# sourceMappingURL=group-limits.js.map