/**
 * "Sign-in and permissions": which login profiles exist and where they may be used, which one is the default, whether an
 * agent may put private-network names in them, and what agents have changed on top (the policy overlay).
 *
 * The profile list is a list: a row per profile, a dialog to edit one or add one. The dialog stages its result like any
 * other control, and the page's Save writes it. The overlay's audit trail is behind "View change log" instead of being
 * spread over the page.
 * @module dsh-browser/client/group-access
 */
import { type Card } from './field-rows.tsx';
export declare const ACCESS_FIELDS: readonly ["defaultAuthProfile", "allowPrivateHosts", "storageStatePath"];
export declare function AccessGroup({ card }: {
    card: Card;
}): import("react").JSX.Element;
