import type { Grid, Point } from "@dungeon-manager/schema";

// Grid calibration in the Map Forge (T-177, SPEC §2.2/§2.5; DM decisions 2026-11-22): the DM
// drags a square box over N × N cells of the map's printed grid; cell size and offset follow.

/** The cell counts a calibration box may span. */
export const CALIBRATION_CELLS = { min: 1, max: 10, default: 3 } as const;

/** Smallest box edge in map pixels: anything smaller is a click, not a box. */
const MIN_BOX_PX = 4;

/** `value` within [0, cell): where a grid line falls inside the first cell. */
function withinCell(value: number, cell: number): number {
  const rest = value % cell;
  // `+ 0` turns −0 into 0.
  return (rest < 0 ? rest + cell : rest) + 0;
}

/**
 * The grid that a box spanning `cells` × `cells` grid cells implies: its corners in map pixels
 * (any two opposite ones, in any order – a turned view swaps or mirrors them). A box a little
 * off square takes its mean edge. `null` for a box too small or a cell count outside 1–10.
 */
export function gridFromBox(a: Point, b: Point, cells: number): Grid | null {
  if (
    !Number.isInteger(cells) ||
    cells < CALIBRATION_CELLS.min ||
    cells > CALIBRATION_CELLS.max
  )
    return null;
  const width = Math.abs(b[0] - a[0]);
  const height = Math.abs(b[1] - a[1]);
  const edge = (width + height) / 2;
  if (Math.min(width, height) < MIN_BOX_PX) return null;
  const cellSizePx = edge / cells;
  return {
    cellSizePx,
    offsetXPx: withinCell(Math.min(a[0], b[0]), cellSizePx),
    offsetYPx: withinCell(Math.min(a[1], b[1]), cellSizePx),
  };
}

/** The grid moved by `dx`, `dy` map pixels, its offset kept within one cell; other fields stay. */
export function shiftGrid<T extends Grid>(grid: T, dx: number, dy: number): T {
  return {
    ...grid,
    offsetXPx: withinCell(grid.offsetXPx + dx, grid.cellSizePx),
    offsetYPx: withinCell(grid.offsetYPx + dy, grid.cellSizePx),
  };
}
