import { jsx as _jsx } from "react/jsx-runtime";
import { Row, Select, TextInput, Toggle, UnitInput } from "./ui-kit.js";
/** Fill `{name}` placeholders of a dictionary entry. */
export const fill = (text, values) => text.replace(/\{(\w+)\}/g, (_match, key) => String(values[key] ?? ''));
/** The words every row shares. */
export function rowLabels(t) {
    return { overridden: t('overridden'), reset: t('reset'), help: t('helpLabel'), invalid: t('invalid') };
}
/** The id of a field's control, tied to its label. */
export const controlId = (name) => `plugin-config-dsh-browser-${name}`;
/** The names that have a `?` text of their own in the dictionary. */
const WITH_HELP = new Set([
    'automationMode', 'toolSurface', 'channel', 'headless', 'autoInstall', 'executablePath', 'cdpPort', 'maxSessions', 'args', 'snapshotDir', 'storageStatePath',
    'viewportMode', 'userAgent', 'locale', 'timezoneId', 'proxyServer', 'proxyBypass', 'downloadDir', 'downloadMaxBytes', 'allowPrivateHosts', 'authProfiles', 'usagePolicy', 'automationAssets',
]);
/** How many of these fields carry an override: the number a group's badge shows. */
export function useOverriddenCount(card, names) {
    return card.useBrowserSettings(snapshot => names.filter(name => stateOf(snapshot, name)?.overridden).length);
}
/** A field's staged state, whether it is a single-input field or one of the JSON-shaped ones (launch arguments, policies). */
export function stateOf(snapshot, name) {
    return snapshot.fields[name] ?? snapshot.jsonFields[name];
}
/** Read one single-input field's staged state. */
export function useField(card, name) {
    const state = card.useBrowserSettings(snapshot => stateOf(snapshot, name));
    const disabled = card.useBrowserSettings(snapshot => !snapshot.writable);
    const problem = card.useBrowserSettings(snapshot => snapshot.problems?.[name]);
    return { state, disabled, problem, edit: (text) => card.edit(name, text), reset: () => card.resetField(name) };
}
function rowFor(props, field, children, extra = {}) {
    const { card, name } = props;
    const { t } = card;
    return _jsx(Row, { field: name, id: extra.id, label: props.label ?? t(name), hint: typeof props.hint === 'function' ? props.hint(field.state.text) : props.hint ?? t(`${name}Hint`), help: WITH_HELP.has(name) ? t(`${name}Help`) : undefined, risk: props.risk, overridden: field.state.overridden, invalid: field.state.invalid || !!field.problem, problem: extra.problem ?? field.problem ?? t('invalid'), disabled: field.disabled, labels: rowLabels(t), onReset: field.reset, inline: extra.inline, wide: extra.wide, children: children });
}
/** A boolean field as a switch. */
export function SwitchRow(props) {
    const field = useField(props.card, props.name);
    const label = props.label ?? props.card.t(props.name);
    return rowFor(props, field, _jsx(Toggle, { label: label, checked: field.state.text === 'true', disabled: field.disabled, onChange: next => field.edit(String(next)) }), { inline: true });
}
/** An enumerated field as a drop-down. */
export function SelectRow(props) {
    const field = useField(props.card, props.name);
    const id = controlId(props.name);
    return rowFor(props, field, _jsx(Select, { id: id, value: field.state.text, options: props.options, disabled: field.disabled, muted: !field.state.overridden, invalid: field.state.invalid || !!field.problem, onChange: field.edit }), { id });
}
/** A free-text field. `listId` names a `<datalist>` of suggestions rendered by the caller. */
export function TextRow(props) {
    const field = useField(props.card, props.name);
    const id = controlId(props.name);
    return rowFor(props, field, _jsx(TextInput, { id: id, value: field.state.text, placeholder: props.placeholder, list: props.listId, code: props.code, disabled: field.disabled, muted: !field.state.overridden, invalid: field.state.invalid || !!field.problem, onChange: field.edit }), { id });
}
/** A whole-number field with its unit written after the input. */
export function NumberRow(props) {
    const field = useField(props.card, props.name);
    const id = controlId(props.name);
    const input = props.unit
        ? _jsx(UnitInput, { id: id, value: field.state.text, unit: props.unit, placeholder: props.placeholder, disabled: field.disabled, muted: !field.state.overridden, invalid: field.state.invalid || !!field.problem, onChange: field.edit })
        : _jsx(TextInput, { id: id, value: field.state.text, placeholder: props.placeholder, numeric: true, disabled: field.disabled, muted: !field.state.overridden, invalid: field.state.invalid || !!field.problem, onChange: field.edit });
    return rowFor(props, field, input, { id });
}
//# sourceMappingURL=field-rows.js.map