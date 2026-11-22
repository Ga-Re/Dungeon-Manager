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
  readonly position: TokenPosition;
  readonly footprint: GridFootprint;
  /** Its disc's radius in cells, when it stands freely (`discRadius`); else half its footprint. */
  readonly radius?: number;
}

/** How far a free disc must reach into a cell to take it, in cells (T-242: "noticeably"). */
const REACH_INTO = 0.1;

/**
 * How much of each cell `others` take (T-233's load: a Tiny token a quarter, others all). A
 * token placed freely takes every cell its disc reaches into noticeably (T-242, DM decision
 * 2026-11-21), so a token on the grid never overlaps it.
 */
function cellLoads(others: readonly Occupant[]): Map<string, number> {
  const load = new Map<string, number>();
  const add = (cell: GridCell, share: number) => {
    load.set(key(cell), (load.get(key(cell)) ?? 0) + share);
  };
  for (const other of others) {
    const { position, footprint } = other;
    if (Number.isInteger(position.col) && Number.isInteger(position.row)) {
      for (const cell of occupiedCells(position, footprint))
        add(cell, footprint.share);
      continue;
    }
    // Free tokens take their cells whole. For larger ones that is their share anyway; for a free
    // Tiny token it matters (T-243): Tiny tokens on the grid arrange in a cell's quarters without
    // regard to a free disc, so they must not share a cell with one.
    for (const cell of reachedCells(other)) add(cell, 1);
  }
  return load;
}

/** The cells a free token's disc reaches into by more than `REACH_INTO` (T-242). */
function reachedCells(occupant: Occupant): GridCell[] {
  const { position, footprint } = occupant;
  const radius =
    occupant.radius ?? Math.min(footprint.cols, footprint.rows) / 2;
  const x = position.col + footprint.cols / 2;
  const y = position.row + footprint.rows / 2;
  const cells: GridCell[] = [];
  for (let row = Math.floor(y - radius); row <= Math.floor(y + radius); row++)
    for (
      let col = Math.floor(x - radius);
      col <= Math.floor(x + radius);
      col++
    ) {
      // The nearest point of the cell to the disc's centre.
      const nearX = Math.min(Math.max(x, col), col + 1);
      const nearY = Math.min(Math.max(y, row), row + 1);
      if (
        col >= 0 &&
        row >= 0 &&
        Math.hypot(x - nearX, y - nearY) < radius - REACH_INTO
      )
        cells.push({ col, row });
    }
  return cells;
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
  /** Among equally near cells, the one nearest to this wins (T-233c: where a token came from). */
  prefer?: TokenPosition,
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
    const toPreferred = ({ col, row }: GridCell) =>
      prefer ? Math.hypot(col - prefer.col, row - prefer.row) : 0;
    const [best] = free.sort(
      (a, b) => distance(a) - distance(b) || toPreferred(a) - toPreferred(b),
    );
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

/** A token being moved onto the grid, or one standing there (`placeOnCells`). */
interface Placing {
  readonly footprint: GridFootprint;
  /** A standing token's disc, when it stands freely (T-242). */
  readonly radius?: number;
  /** Whether the table sees it: one it does not see never redirects one it sees. */
  readonly seen: boolean;
}

/**
 * Where moved tokens end up on the grid (T-233c): each on its wanted cell if that is free, else
 * on the free cell nearest to it – never on an occupied one (up to four Tiny tokens share a
 * cell, a large token claims its footprint). Tokens the table sees go first, in the given order,
 * and only among tokens it sees: an unseen token never redirects a seen one, which would give
 * it away (DM decision, 2026-11-21). Unseen ones then fit around everything; a seen token may
 * so end up on an unseen one's cell. `null` when one finds no room.
 */
export function placeOnCells<T extends string>(
  moving: readonly (Placing & {
    readonly id: T;
    readonly wanted: GridCell;
    /** Where it stands now: of equally near free cells, the one nearest to it wins. */
    readonly from?: TokenPosition;
  })[],
  standing: readonly (Placing & { readonly position: TokenPosition })[],
  bounds: Required<CellBounds>,
): Map<T, GridCell> | null {
  const cells = new Map<T, GridCell>();
  const placedSeen: Occupant[] = [];
  const placedAll: Occupant[] = [];
  const place = (
    token: (typeof moving)[number],
    blockers: readonly Occupant[],
  ): boolean => {
    const inside =
      token.wanted.col >= bounds.firstCol &&
      token.wanted.row >= bounds.firstRow &&
      token.wanted.col + token.footprint.cols <= bounds.cols &&
      token.wanted.row + token.footprint.rows <= bounds.rows;
    const cell =
      inside && canOccupy(blockers, token.wanted, token.footprint)
        ? token.wanted
        : nearestFreeCell(
            token.wanted,
            token.footprint,
            blockers,
            bounds,
            token.from,
          );
    if (!cell) return false;
    const occupant = { position: cell, footprint: token.footprint };
    if (token.seen) placedSeen.push(occupant);
    placedAll.push(occupant);
    cells.set(token.id, cell);
    return true;
  };
  const standingSeen = standing.filter((each) => each.seen);
  for (const token of moving.filter((each) => each.seen))
    if (!place(token, [...standingSeen, ...placedSeen])) return null;
  for (const token of moving.filter((each) => !each.seen))
    if (!place(token, [...standing, ...placedAll])) return null;
  return cells;
}

/**
 * A token's disc as drawn, in cells (T-233d): free tokens are kept apart by it. Tiny ones are
 * half a cell wide, Small ones three quarters, larger ones as wide as their footprint.
 */
export function discRadius(size: TokenSize, footprint: GridFootprint): number {
  if (size === "tiny") return 0.25;
  if (size === "small") return 0.375;
  return Math.min(footprint.cols, footprint.rows) / 2;
}

/**
 * Where Tiny tokens sharing a cell sit, by how many share it (T-233c): the centres of their
 * discs, in parts of the cell – one in the middle, two side by side, three in a triangle, four
 * in the quarters.
 */
const TINY_SLOTS: readonly (readonly (readonly [number, number])[])[] = [
  [[0.5, 0.5]],
  [
    [0.25, 0.5],
    [0.75, 0.5],
  ],
  [
    [0.25, 0.25],
    [0.75, 0.25],
    [0.5, 0.75],
  ],
  [
    [0.25, 0.25],
    [0.75, 0.25],
    [0.25, 0.75],
    [0.75, 0.75],
  ],
];

/**
 * The centres of Tiny tokens' discs, in cells (T-233c): Tiny tokens on one whole cell arrange
 * by how many share it, in the given order; a Tiny token placed freely sits in the middle of
 * its square. One definition for drawing (DM window, TV) and for keeping free tokens apart.
 */
export function tinyCentres<T extends string>(
  tokens: readonly {
    readonly id: T;
    readonly size: TokenSize;
    readonly position: TokenPosition;
  }[],
): Map<T, TokenPosition> {
  const sharing = new Map<string, T[]>();
  const onCell = (position: TokenPosition) =>
    Number.isInteger(position.col) && Number.isInteger(position.row);
  for (const token of tokens)
    if (token.size === "tiny" && onCell(token.position)) {
      const key = `${String(token.position.col)},${String(token.position.row)}`;
      const together = sharing.get(key);
      if (together) together.push(token.id);
      else sharing.set(key, [token.id]);
    }
  const centres = new Map<T, TokenPosition>();
  for (const token of tokens) {
    if (token.size !== "tiny") continue;
    const key = `${String(token.position.col)},${String(token.position.row)}`;
    const together = onCell(token.position) ? sharing.get(key) : undefined;
    const slots = TINY_SLOTS[Math.min(together?.length ?? 1, 4) - 1] ?? [];
    const [x, y] = slots[
      (together?.indexOf(token.id) ?? 0) % Math.max(1, slots.length)
    ] ?? [0.5, 0.5];
    centres.set(token.id, {
      col: token.position.col + x,
      row: token.position.row + y,
    });
  }
  return centres;
}

/** A token placed freely, or one standing, as far as free space goes (`placeFree`). */
interface FreePlacing {
  readonly footprint: GridFootprint;
  readonly radius: number;
  readonly seen: boolean;
}

/** How finely free positions are searched, in cells, and in how many directions. */
const FREE_STEP = 0.05;
const FREE_ANGLES = 32;
/** Free positions are kept to a thousandth of a cell, so files stay readable. */
const roundFree = (value: number) => Math.round(value * 1000) / 1000;

/**
 * Where tokens moved freely end up (T-233d): where wanted if their disc overlaps no other and
 * stays on the map, else pushed away to the nearest spot found that fits – touching the token
 * in the way, a free cell, or a point on rings around the wanted spot (so a spot within a
 * twentieth of a cell of the nearest possible one); of equally near spots the one nearest to
 * where the token came from. Never stricter than the grid: a free cell always counts. Like
 * `placeOnCells`, tokens the table sees go first and only among seen ones; unseen ones then fit
 * around everything. A standing token's disc may be given by its `centre` (Tiny ones sharing a
 * cell sit off its middle). `null` when one finds no room.
 */
export function placeFree<T extends string>(
  moving: readonly (FreePlacing & {
    readonly id: T;
    readonly wanted: TokenPosition;
    readonly from?: TokenPosition;
  })[],
  standing: readonly (FreePlacing & {
    readonly position: TokenPosition;
    readonly centre?: TokenPosition;
  })[],
  bounds: Required<CellBounds>,
): Map<T, TokenPosition> | null {
  type Disc = {
    readonly x: number;
    readonly y: number;
    readonly r: number;
    readonly occupant: Occupant;
  };
  const discOf = (
    position: TokenPosition,
    token: FreePlacing,
    centre?: TokenPosition,
  ): Disc => ({
    x: centre?.col ?? position.col + token.footprint.cols / 2,
    y: centre?.row ?? position.row + token.footprint.rows / 2,
    r: token.radius,
    occupant: { position, footprint: token.footprint, radius: token.radius },
  });
  const result = new Map<T, TokenPosition>();
  const placedSeen: Disc[] = [];
  const placedAll: Disc[] = [];
  const place = (
    token: (typeof moving)[number],
    blockers: readonly Disc[],
  ): boolean => {
    const { cols, rows } = token.footprint;
    const halfCols = cols / 2;
    const halfRows = rows / 2;
    // Positions are top left corners; discs are kept apart by their centres.
    const fits = (col: number, row: number) => {
      if (
        col < bounds.firstCol ||
        row < bounds.firstRow ||
        col + cols > bounds.cols ||
        row + rows > bounds.rows
      )
        return false;
      const x = col + halfCols;
      const y = row + halfRows;
      // A thousandth of tolerance: positions are rounded to it.
      return blockers.every(
        (other) =>
          Math.hypot(x - other.x, y - other.y) >= token.radius + other.r - 1e-3,
      );
    };
    const wanted = {
      col: roundFree(token.wanted.col),
      row: roundFree(token.wanted.row),
    };
    let found: TokenPosition | null = fits(wanted.col, wanted.row)
      ? wanted
      : null;
    if (!found) {
      const away = (spot: TokenPosition) =>
        Math.hypot(spot.col - wanted.col, spot.row - wanted.row);
      const toOrigin = (spot: TokenPosition) =>
        token.from
          ? Math.hypot(spot.col - token.from.col, spot.row - token.from.row)
          : 0;
      // In an object: TypeScript does not follow assignments made inside `consider`.
      const choice: { best: TokenPosition | null } = { best: null };
      const consider = (col: number, row: number) => {
        const spot = { col: roundFree(col), row: roundFree(row) };
        if (!fits(spot.col, spot.row)) return;
        const { best } = choice;
        if (
          !best ||
          away(spot) < away(best) - 1e-9 ||
          (Math.abs(away(spot) - away(best)) <= 1e-9 &&
            toOrigin(spot) < toOrigin(best))
        )
          choice.best = spot;
      };
      // Touching each token in the way, on the line from it through the wanted spot.
      const x = wanted.col + halfCols;
      const y = wanted.row + halfRows;
      for (const other of blockers) {
        const dx = x - other.x;
        const dy = y - other.y;
        const length = Math.hypot(dx, dy);
        const ux = length > 1e-9 ? dx / length : 1;
        const uy = length > 1e-9 ? dy / length : 0;
        const gap = token.radius + other.r + 1e-3;
        consider(other.x + ux * gap - halfCols, other.y + uy * gap - halfRows);
      }
      // The nearest free cell: free placement is never stricter than the grid.
      const cell = nearestFreeCell(
        { col: Math.round(wanted.col), row: Math.round(wanted.row) },
        token.footprint,
        blockers.map((each) => each.occupant),
        bounds,
        token.from,
      );
      if (cell) consider(cell.col, cell.row);
      // Rings around the wanted spot, out to the best spot so far or the map's far corner.
      const corner = Math.hypot(bounds.cols, bounds.rows);
      for (let step = 1; step * FREE_STEP <= corner; step++) {
        const distance = step * FREE_STEP;
        if (choice.best && distance >= away(choice.best)) break;
        for (let index = 0; index < FREE_ANGLES; index++) {
          const angle = (index / FREE_ANGLES) * 2 * Math.PI;
          consider(
            wanted.col + Math.cos(angle) * distance,
            wanted.row + Math.sin(angle) * distance,
          );
        }
      }
      found = choice.best;
    }
    if (!found) return false;
    const disc = discOf(found, token);
    if (token.seen) placedSeen.push(disc);
    placedAll.push(disc);
    result.set(token.id, found);
    return true;
  };
  const standingAll = standing.map((each) =>
    discOf(each.position, each, each.centre),
  );
  const standingSeen = standing
    .filter((each) => each.seen)
    .map((each) => discOf(each.position, each, each.centre));
  for (const token of moving.filter((each) => each.seen))
    if (!place(token, [...standingSeen, ...placedSeen])) return null;
  for (const token of moving.filter((each) => !each.seen))
    if (!place(token, [...standingAll, ...placedAll])) return null;
  return result;
}
