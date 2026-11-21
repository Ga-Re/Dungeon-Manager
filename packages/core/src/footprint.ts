import type {
  Footprint,
  Grid,
  GridCell,
  TokenPosition,
  TokenSize,
} from "@dungeon-manager/schema";

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

/**
 * How much of each cell `others` take (T-233's load: a Tiny token a quarter, others all). A
 * token placed freely counts as standing on its nearest cell (T-233b).
 */
function cellLoads(others: readonly Occupant[]): Map<string, number> {
  const load = new Map<string, number>();
  for (const other of others)
    for (const cell of occupiedCells(
      {
        col: Math.round(other.position.col),
        row: Math.round(other.position.row),
      },
      other.footprint,
    ))
      load.set(key(cell), (load.get(key(cell)) ?? 0) + other.footprint.share);
  return load;
}

const key = (cell: GridCell) => `${String(cell.col)},${String(cell.row)}`;

const fits = (
  load: ReadonlyMap<string, number>,
  position: GridCell,
  footprint: GridFootprint,
) =>
  // Shares are quarters or wholes: compared with a small tolerance, never exactly.
  occupiedCells(position, footprint).every(
    (cell) => (load.get(key(cell)) ?? 0) + footprint.share <= 1 + 1e-9,
  );

/** Whether a token with `footprint` may stand at `position` next to `others` (T-233). */
export function canOccupy(
  others: readonly Occupant[],
  position: GridCell,
  footprint: GridFootprint,
): boolean {
  return fits(cellLoads(others), position, footprint);
}

/**
 * The free cell nearest to `wanted` where a token with `footprint` fits completely inside the
 * map (`bounds` in cells); `null` if none (T-107a, and T-233's snap). Nearest by rings of cells
 * around it (the grid distance of D&D 5e); within a ring, the closest in a straight line.
 */
export function nearestFreeCell(
  wanted: GridCell,
  footprint: GridFootprint,
  others: readonly Occupant[],
  bounds: CellBounds,
): GridCell | null {
  const minCol = bounds.firstCol ?? 0;
  const minRow = bounds.firstRow ?? 0;
  const maxCol = bounds.cols - footprint.cols;
  const maxRow = bounds.rows - footprint.rows;
  if (maxCol < minCol || maxRow < minRow) return null;
  const start = {
    col: Math.min(Math.max(wanted.col, minCol), maxCol),
    row: Math.min(Math.max(wanted.row, minRow), maxRow),
  };
  // The loads once, not for every candidate.
  const load = cellLoads(others);
  const reach = Math.max(maxCol, maxRow);
  for (let ring = 0; ring <= reach; ring++) {
    // Only the ring's edge: its top and bottom rows, then its left and right columns.
    const edge: GridCell[] = [];
    for (let col = start.col - ring; col <= start.col + ring; col++) {
      edge.push({ col, row: start.row - ring });
      if (ring > 0) edge.push({ col, row: start.row + ring });
    }
    for (let row = start.row - ring + 1; row <= start.row + ring - 1; row++) {
      edge.push({ col: start.col - ring, row });
      edge.push({ col: start.col + ring, row });
    }
    const free = edge.filter(
      ({ col, row }) =>
        col >= minCol &&
        row >= minRow &&
        col <= maxCol &&
        row <= maxRow &&
        fits(load, { col, row }, footprint),
    );
    const distance = ({ col, row }: GridCell) =>
      Math.hypot(col - start.col, row - start.row);
    const [best] = free.sort((a, b) => distance(a) - distance(b));
    if (best) return best;
  }
  return null;
}

/**
 * Whole cells of a map, as grid coordinates: `firstCol`/`firstRow` up to (not including)
 * `cols`/`rows`. Cells are counted from the grid's offset; a cell cut by the map's edge is not
 * one (a token there would hang off the map).
 */
export interface CellBounds {
  readonly firstCol?: number;
  readonly firstRow?: number;
  readonly cols: number;
  readonly rows: number;
}

/** The whole cells of a map of `size` map pixels on `grid` (T-107a). */
export function gridBounds(
  size: { readonly width: number; readonly height: number },
  grid: Grid,
): Required<CellBounds> {
  const cell = grid.cellSizePx;
  if (!(cell > 0)) return { firstCol: 0, firstRow: 0, cols: 0, rows: 0 };
  return {
    // Grid cells are never negative (the scene file allows none).
    firstCol: Math.max(0, Math.ceil(-grid.offsetXPx / cell)),
    firstRow: Math.max(0, Math.ceil(-grid.offsetYPx / cell)),
    cols: Math.floor((size.width - grid.offsetXPx) / cell),
    rows: Math.floor((size.height - grid.offsetYPx) / cell),
  };
}

/** The cell in the middle of `bounds` for a footprint (where new tokens go first). */
export function middleCell(
  bounds: Required<CellBounds>,
  footprint: GridFootprint,
): GridCell {
  return {
    col: Math.floor((bounds.firstCol + bounds.cols - footprint.cols) / 2),
    row: Math.floor((bounds.firstRow + bounds.rows - footprint.rows) / 2),
  };
}

/**
 * `delta` cut down so every token of a group, each at `position` with its footprint, stays on
 * the whole cells of `bounds` (T-107b: a group dragged against the map's edge stops there,
 * keeping its formation). A group already partly off the map is not moved further out.
 */
export function clampGroupShift(
  group: readonly {
    readonly position: GridCell;
    readonly footprint: GridFootprint;
  }[],
  delta: GridCell,
  bounds: Required<CellBounds>,
): GridCell {
  const axis = (
    wanted: number,
    first: number,
    // Exclusive, like `CellBounds`.
    end: number,
    start: (each: (typeof group)[number]) => number,
    size: (each: (typeof group)[number]) => number,
  ) => {
    let lowest = -Infinity;
    let highest = Infinity;
    for (const each of group) {
      lowest = Math.max(lowest, Math.min(0, first - start(each)));
      highest = Math.min(highest, Math.max(0, end - size(each) - start(each)));
    }
    return Math.min(highest, Math.max(lowest, wanted));
  };
  return {
    col: axis(
      delta.col,
      bounds.firstCol,
      bounds.cols,
      (each) => each.position.col,
      (each) => each.footprint.cols,
    ),
    row: axis(
      delta.row,
      bounds.firstRow,
      bounds.rows,
      (each) => each.position.row,
      (each) => each.footprint.rows,
    ),
  };
}

/**
 * Combat's snap (T-233): a whole cell for each token inside `bounds`, no two on one cell (up to
 * four Tiny ones share one), large footprints whole. The token nearest to a cell goes first and
 * takes the free cell nearest to where it stands; `null` when one finds no room. `occupied`:
 * tokens already standing, which keep their place.
 */
export function snapToCells<T extends string>(
  tokens: readonly {
    readonly id: T;
    readonly position: TokenPosition;
    readonly footprint: GridFootprint;
  }[],
  bounds: Required<CellBounds>,
  occupied: readonly Occupant[] = [],
): Map<T, GridCell> | null {
  const offCell = (position: TokenPosition) =>
    Math.hypot(
      position.col - Math.round(position.col),
      position.row - Math.round(position.row),
    );
  // Stable: equally near tokens keep their order (the scene's).
  const order = [...tokens].sort(
    (a, b) => offCell(a.position) - offCell(b.position),
  );
  const placed: Occupant[] = [...occupied];
  const cells = new Map<T, GridCell>();
  for (const token of order) {
    const cell = nearestFreeCell(
      {
        col: Math.round(token.position.col),
        row: Math.round(token.position.row),
      },
      token.footprint,
      placed,
      bounds,
    );
    if (!cell) return null;
    placed.push({ position: cell, footprint: token.footprint });
    cells.set(token.id, cell);
  }
  return cells;
}
