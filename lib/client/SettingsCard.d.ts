/**
 * The browser settings card, as the Plugins page renders it.
 *
 * The page owns the card frame — its title button, disclosure, and artwork come from the slot registration — so this
 * component renders only what goes inside: the one-liner for `view: 'summary'`, and for `view: 'page'` a status
 * summary, nine groups (only "Common" open) and a save bar that stays in view.
 *
 *   Common · Browser · Page environment · Downloads · Sign-in and permissions · Usage limits · Prompts ·
 *   Automation assets · Advanced: text mode
 *
 * Each group is its own module (`group-*.tsx`) built from the controls in `ui-kit.tsx`: the Host's own switches,
 * buttons, badges, dialogs and help bubbles, plus the few controls the Host has no component for. Every public config
 * field has exactly one entry in the groups (test/settings-card-render.test.ts counts them); the properties text of the
 * last group is a view of the same fields, not a second place they live.
 * @module dsh-browser/client/SettingsCard
 */
import type { BrowserSettingsCardProps } from './index.ts';
export declare function SettingsCard(props: BrowserSettingsCardProps): import("react").JSX.Element;
