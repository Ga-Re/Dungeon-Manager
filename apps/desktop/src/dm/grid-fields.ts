import type { Grid } from "@dungeon-manager/schema";

// Grid values as the DM types them (T-177): text fields, read leniently, shown rounded.

/** A finite number from a field (comma or point), or `null`. */
export function numberOf(text: string): number | null {
  if (text.trim() === "") return null;
  const value = Number(text.replace(",", "."));
  return Number.isFinite(value) ? value : null;
}

/** A calibrated value as a field shows it: at most two decimals. */
export function shownValue(value: number): string {
  return String(Math.round(value * 100) / 100);
}

/** An offset as shown: rounded, and one a hair short of a whole cell shown as 0. */
export function shownOffset(offset: number, cell: number): string {
  const rounded = Math.round(offset * 100) / 100;
  return String(rounded >= Math.round(cell * 100) / 100 ? 0 : rounded);
}

/** The grid three fields describe, other grid fields from `stored`; `null` while invalid. */
export function gridOfFields(
  fields: {
    readonly cellSizePx: string;
    readonly offsetXPx: string;
    readonly offsetYPx: string;
  },
  stored: Grid,
): Grid | null {
  const cellSizePx = numberOf(fields.cellSizePx);
  const offsetXPx = numberOf(fields.offsetXPx);
  const offsetYPx = numberOf(fields.offsetYPx);
  return cellSizePx !== null &&
    cellSizePx > 0 &&
    offsetXPx !== null &&
    offsetYPx !== null
    ? { ...stored, cellSizePx, offsetXPx, offsetYPx }
    : null;
}
