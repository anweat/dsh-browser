/**
 * "Advanced: text mode": the default parameters as one commented `key = value` text, for people who prefer to read and
 * edit them that way. It is a view of the controls above, not a second place the settings live: editing the text stages
 * the same fields, and editing a control prints the text again. Every key has a comment in front of it (what it is for,
 * the allowed values, the default, the risk); comment lines are ignored when the text is read.
 * @module dsh-browser/client/group-advanced
 */
import { type Card } from './field-rows.tsx';
export declare function AdvancedGroup({ card }: {
    card: Card;
}): import("react").JSX.Element;
