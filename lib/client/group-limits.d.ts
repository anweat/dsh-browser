/**
 * "Usage limits": the call buffer as grouped number inputs with their unit, range and default, and the asset policy
 * in a fold. Each key edits the same staged JSON object the raw box (folded away under "Advanced: raw JSON") shows.
 * @module dsh-browser/client/group-limits
 */
import { type Card } from './field-rows.tsx';
export declare function LimitsGroup({ card }: {
    card: Card;
}): import("react").JSX.Element;
