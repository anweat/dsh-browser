/**
 * "Common": the four settings nearly everyone touches. Open by default; every other group starts closed.
 * @module dsh-browser/client/group-common
 */
import { type Card } from './field-rows.tsx';
/** The names of the common group's fields, in order. */
export declare const COMMON_FIELDS: readonly ["enabled", "automationMode", "toolSurface", "opencliEnabled"];
export declare function CommonGroup({ card }: {
    card: Card;
}): import("react").JSX.Element;
