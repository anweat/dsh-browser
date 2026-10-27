/**
 * "Browser": which engine runs and how. Four everyday choices up front; the rest folded under "Advanced".
 * @module dsh-browser/client/group-browser
 */
import { type Card } from './field-rows.tsx';
export declare const BROWSER_FIELDS: readonly ["browserRuntime", "channel", "headless", "autoInstall", "executablePath", "cdpPort", "maxSessions", "args", "snapshotDir", "verbose"];
export declare function BrowserGroup({ card }: {
    card: Card;
}): import("react").JSX.Element;
