/**
 * "Automation assets": reusable recipes and userscripts. The group is a list (a suggestion row per candidate the plugin
 * wants summarized, a row per asset) and ONE editor dialog; it does not lay the editor out beside the list any more.
 *
 * The editing logic is unchanged and lives in `automation-assets-client.ts`: every way out of unsaved edits (closing the
 * dialog, creating, forking, converting, refreshing) goes through a request/confirm pair, which this dialog shows as a
 * confirmation inside itself. Closing the dialog is a request to select nothing.
 * @module dsh-browser/client/group-assets
 */
import { type Card } from './field-rows.tsx';
export declare function AssetsGroup({ card }: {
    card: Card;
}): import("react").JSX.Element;
