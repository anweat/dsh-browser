/**
 * Byte counts as a number in a unit, for the download size control. The setting itself stays a plain byte count.
 * @module dsh-browser/client/size-units
 */
export declare const SIZE_UNITS: readonly [readonly ["B", 1], readonly ["KiB", 1024], readonly ["MiB", number], readonly ["GiB", number]];
export type SizeUnit = typeof SIZE_UNITS[number][0];
/** The unit a byte count is shown in: the largest that divides it exactly (MiB when there is no count). */
export declare function unitFor(bytes: number | undefined): SizeUnit;
/** A byte count as the text of one unit, without a trailing ".0". */
export declare function bytesToUnitText(bytes: number, unit: SizeUnit): string;
/** The bytes a number typed in a unit stands for: '' for an empty text ("unset"), undefined when it is not a positive number. */
export declare function unitTextToBytes(text: string, unit: SizeUnit): number | '' | undefined;
