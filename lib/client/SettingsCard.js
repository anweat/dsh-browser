import { Fragment as _Fragment, jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Frame, SaveBar, SummaryBar } from "./card-frame.js";
import { AccessGroup } from "./group-access.js";
import { AdvancedGroup } from "./group-advanced.js";
import { AssetsGroup } from "./group-assets.js";
import { BrowserGroup } from "./group-browser.js";
import { CommonGroup } from "./group-common.js";
import { ContextGroup } from "./group-context.js";
import { DownloadsGroup } from "./group-downloads.js";
import { LimitsGroup } from "./group-limits.js";
import { PromptsGroup } from "./group-prompts.js";
export function SettingsCard(props) {
    // The one-liner the Plugins list shows. Without it the list falls back to the
    // package's npm description, which reads like a styling bug and is not one.
    if (props.view === 'summary')
        return _jsx(_Fragment, { children: props.t('description') });
    return _jsxs(Frame, { card: props, children: [_jsx(SummaryBar, { card: props }), _jsx(CommonGroup, { card: props }), _jsx(BrowserGroup, { card: props }), _jsx(ContextGroup, { card: props }), _jsx(DownloadsGroup, { card: props }), _jsx(AccessGroup, { card: props }), _jsx(LimitsGroup, { card: props }), _jsx(PromptsGroup, { card: props }), _jsx(AssetsGroup, { card: props }), _jsx(AdvancedGroup, { card: props }), _jsx(SaveBar, { card: props })] });
}
//# sourceMappingURL=SettingsCard.js.map