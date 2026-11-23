import type { Grid, Polygon, Area } from "@dungeon-manager/schema";

// Areas of a map – rooms, parts of a cave, far places (T-108c1, T-262, SPEC 4, ADR-0012; DM
// decisions 2026-11-22/23): drawn once per level in the map's sidecar, so every scene has them.

/** The shapes an area is drawn with; a lasso is free-hand and never snaps. */
export type AreaShape = "rectangle" | "polygon" | "ellipse" | "lasso";

/** The areas on `levelId`; an area without a level lies on the map's first level. */
export function areasOnLevel<T extends Pick<Area, "levelId">>(
  areas: readonly T[],
  levels: readonly { readonly id: string }[],
  levelId: string,
): T[] {
  const first = levels[0]?.id;
  return areas.filter((area) => (area.levelId ?? first) === levelId);
}

/**
 * A fresh area id, `area-` and six random characters, not taken by the map's levels or areas.
 * Never counted up from the areas there: a deleted area's id must not come back, as scenes keep
 * overrides keyed by it (ADR-0012). Areas drawn before T-262 keep their `room-` ids.
 * `random` is injected (`core` is pure), e.g. `Math.random`.
 */
export function newAreaId(
  taken: readonly string[],
  random: () => number,
): string {
  const used = new Set(taken);
  for (;;) {
    const id = `area-${Math.floor(random() * 36 ** 6)
      .toString(36)
      .padStart(6, "0")}`;
    if (!used.has(id)) return id;
  }
}

/** The nearest grid line position to `value` on one axis. */
function snap(value: number, cell: number, offset: number): number {
  return Math.round((value - offset) / cell) * cell + offset;
}

/** Whether a ring encloses some area, so a snapped area is not a line or a point. */
function hasArea(ring: readonly (readonly [number, number])[]): boolean {
  let twice = 0;
  for (let i = 0; i < ring.length; i += 1) {
    const [x1, y1] = ring[i] ?? [0, 0];
    const [x2, y2] = ring[(i + 1) % ring.length] ?? [0, 0];
    twice += x1 * y2 - x2 * y1;
  }
  return Math.abs(twice) > 0;
}

/**
 * A drawn area snapped to the grid (DM decision): a rectangle's or polygon's corners move to the
 * nearest grid points, an ellipse is fitted into its bounding box snapped to the grid, a lasso
 * stays as drawn. `null` when it snaps to nothing (narrower than half a cell).
 */
export function snapArea(
  area: Polygon,
  grid: Grid,
  shape: AreaShape,
): Polygon | null {
  if (shape === "lasso") return area;
  const { cellSizePx: cell, offsetXPx: ox, offsetYPx: oy } = grid;
  if (shape === "ellipse") {
    const xs = area.outer.map(([x]) => x);
    const ys = area.outer.map(([, y]) => y);
    const [minX, maxX, minY, maxY] = [
      Math.min(...xs),
      Math.max(...xs),
      Math.min(...ys),
      Math.max(...ys),
    ];
    const [left, right, top, bottom] = [
      snap(minX, cell, ox),
      snap(maxX, cell, ox),
      snap(minY, cell, oy),
      snap(maxY, cell, oy),
    ];
    if (left === right || top === bottom || maxX === minX || maxY === minY)
      return null;
    const scale = (
      value: number,
      from: number,
      to: number,
      a: number,
      b: number,
    ) => a + ((value - from) / (to - from)) * (b - a);
    return {
      outer: area.outer.map(([x, y]) => [
        scale(x, minX, maxX, left, right),
        scale(y, minY, maxY, top, bottom),
      ]),
      holes: [],
    };
  }
  const outer: [number, number][] = [];
  for (const [x, y] of area.outer) {
    const point: [number, number] = [snap(x, cell, ox), snap(y, cell, oy)];
    const last = outer.at(-1);
    // Corners that snap onto the same grid point become one.
    if (!last || last[0] !== point[0] || last[1] !== point[1])
      outer.push(point);
  }
  const first = outer[0];
  const end = outer.at(-1);
  if (
    outer.length > 1 &&
    first &&
    end &&
    first[0] === end[0] &&
    first[1] === end[1]
  )
    outer.pop();
  return outer.length >= 3 && hasArea(outer) ? { outer, holes: [] } : null;
}
