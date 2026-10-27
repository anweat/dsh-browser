/**
 * Byte counts as a number in a unit, for the download size control. The setting itself stays a plain byte count.
 * @module dsh-browser/client/size-units
 */

export const SIZE_UNITS = [['B', 1], ['KiB', 1024], ['MiB', 1024 ** 2], ['GiB', 1024 ** 3]] as const
export type SizeUnit = typeof SIZE_UNITS[number][0]

const factor = (unit: SizeUnit): number => SIZE_UNITS.find(([name]) => name === unit)![1]

/** The unit a byte count is shown in: the largest that divides it exactly (MiB when there is no count). */
export function unitFor(bytes: number | undefined): SizeUnit {
  if (bytes === undefined || !Number.isFinite(bytes) || bytes <= 0) return 'MiB'
  for (const [name, size] of [...SIZE_UNITS].reverse()) if (bytes % size === 0) return name
  return 'B'
}

/** A byte count as the text of one unit, without a trailing ".0". */
export function bytesToUnitText(bytes: number, unit: SizeUnit): string {
  return String(bytes / factor(unit))
}

/** The bytes a number typed in a unit stands for: '' for an empty text ("unset"), undefined when it is not a positive number. */
export function unitTextToBytes(text: string, unit: SizeUnit): number | '' | undefined {
  if (text.trim() === '') return ''
  const value = Number(text)
  if (!Number.isFinite(value) || value <= 0) return undefined
  return Math.round(value * factor(unit))
}
