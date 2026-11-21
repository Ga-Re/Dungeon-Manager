import type { Footprint, GridCell, TokenSize } from "@dungeon-manager/schema";

// The cells a token covers on the grid (T-180a) and whether it may stand somewhere (T-233, SPEC
// §5): one token per cell; up to four Tiny ones share a cell; a larger token claims every cell
// of its footprint.

/** Grid cells covered per side by each 5e size; Tiny and Small still use one cell. */
const CELLS_PER_SIDE: Record<TokenSize, number> = {
  tiny: 1,
  small: 1,
  medium: 1,
  large: 2,
  huge: 3,
  gargantuan: 4,
};

/** How many Tiny creatures share one cell. */
const TINY_PER_CELL = 4;

/** A token's footprint: whole cells, and the share of each cell it takes (Tiny: a quarter). */
export interface GridFootprint {
  readonly cols: number;
  readonly rows: number;
  /** Of each covered cell; cells hold at most 1. */
  readonly share: number;
}

/** The footprint of a creature of `size`, or its own (`custom`, e.g. 2 × 4 for a wagon). */
export function gridFootprint(
  size: TokenSize,
  custom?: Footprint,
): GridFootprint {
  if (custom) return { cols: custom.cols, rows: custom.rows, share: 1 };
  const side = CELLS_PER_SIDE[size];
  return {
    cols: side,
    rows: side,
    share: size === "tiny" ? 1 / TINY_PER_CELL : 1,
  };
}

/** The cells covered by a footprint whose top left cell is `position`. */
export function occupiedCells(
  position: GridCell,
  footprint: GridFootprint,
): GridCell[] {
  const cells: GridCell[] = [];
  for (let row = 0; row < footprint.rows; row++)
    for (let col = 0; col < footprint.cols; col++)
      cells.push({ col: position.col + col, row: position.row + row });
  return cells;
}

/** A token already on the grid, as far as space goes. */
export interface Occupant {
  readonly position: GridCell;
  readonly footprint: GridFootprint;
}

/** Whether a token with `footprint` may stand at `position` next to `others` (T-233). */
export function canOccupy(
  others: readonly Occupant[],
  position: GridCell,
  footprint: GridFootprint,
): boolean {
  const load = new Map<string, number>();
  const key = (cell: GridCell) => `${String(cell.col)},${String(cell.row)}`;
  for (const other of others)
    for (const cell of occupiedCells(other.position, other.footprint))
      load.set(key(cell), (load.get(key(cell)) ?? 0) + other.footprint.share);
  // Shares are quarters or wholes: compared with a small tolerance, never exactly.
  return occupiedCells(position, footprint).every(
    (cell) => (load.get(key(cell)) ?? 0) + footprint.share <= 1 + 1e-9,
  );
}

/**
 * The free cell nearest to `wanted` where a token with `footprint` fits completely inside the
 * map (`bounds` in cells), searched in growing rings (T-107a, and T-233's snap); `null` if none.
 */
export function nearestFreeCell(
  wanted: GridCell,
  footprint: GridFootprint,
  others: readonly Occupant[],
  bounds: { readonly cols: number; readonly rows: number },
): GridCell | null {
  const maxCol = bounds.cols - footprint.cols;
  const maxRow = bounds.rows - footprint.rows;
  if (maxCol < 0 || maxRow < 0) return null;
  const start = {
    col: Math.min(Math.max(wanted.col, 0), maxCol),
    row: Math.min(Math.max(wanted.row, 0), maxRow),
  };
  const reach = Math.max(bounds.cols, bounds.rows);
  for (let ring = 0; ring <= reach; ring++) {
    let best: GridCell | null = null;
    let bestDistance = Infinity;
    for (let row = start.row - ring; row <= start.row + ring; row++)
      for (let col = start.col - ring; col <= start.col + ring; col++) {
        // Only the ring's edge: the inside was searched before.
        const onRing =
          Math.max(Math.abs(col - start.col), Math.abs(row - start.row)) ===
          ring;
        if (!onRing || col < 0 || row < 0 || col > maxCol || row > maxRow)
          continue;
        const cell = { col, row };
        if (!canOccupy(others, cell, footprint)) continue;
        const distance = Math.hypot(col - start.col, row - start.row);
        if (distance < bestDistance) {
          best = cell;
          bestDistance = distance;
        }
      }
    if (best) return best;
  }
  return null;
}
