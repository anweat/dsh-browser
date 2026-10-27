import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * "Common": the four settings nearly everyone touches. Open by default; every other group starts closed.
 * @module dsh-browser/client/group-common
 */
import { fill, SelectRow, SwitchRow, useOverriddenCount } from "./field-rows.js";
import { Badge, Group } from "./ui-kit.js";
/** The names of the common group's fields, in order. */
export const COMMON_FIELDS = ['enabled', 'automationMode', 'toolSurface', 'opencliEnabled'];
const MODE_LINES = { 'read-only': 'modeReadOnlyLine', standard: 'modeStandardLine', autonomous: 'modeAutonomousLine', unrestricted: 'modeUnrestrictedLine' };
export function CommonGroup({ card }) {
    const { t } = card;
    const count = useOverriddenCount(card, COMMON_FIELDS);
    return _jsxs(Group, { id: "common", title: t('groupCommon'), summary: t('groupCommonSub'), defaultOpen: true, badges: count ? _jsx(Badge, { tone: "info", children: fill(t('overriddenCount'), { n: count }) }) : null, children: [_jsx(SwitchRow, { card: card, name: "enabled" }), _jsx(SelectRow, { card: card, name: "automationMode", hint: text => t(MODE_LINES[text] ?? 'automationModeHint'), options: [
                    { value: 'read-only', label: t('modeReadOnly') },
                    { value: 'standard', label: t('modeStandard') },
                    { value: 'autonomous', label: t('modeAutonomous') },
                    { value: 'unrestricted', label: t('modeUnrestricted') },
                ] }), _jsx(SelectRow, { card: card, name: "toolSurface", options: [{ value: 'indexed', label: t('surfaceIndexed') }, { value: 'flat', label: t('surfaceFlat') }] }), _jsx(SwitchRow, { card: card, name: "opencliEnabled" })] });
}
//# sourceMappingURL=group-common.js.map