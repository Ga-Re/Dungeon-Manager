import type { Area, Grid, Polygon } from "@dungeon-manager/schema";
import { union } from "polyclip-ts";
import { isInside } from "./fog.js";
import { asGeom, fromClip } from "./polygon-clip.js";

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

/**
 * Adds a drawn shape to the area drawn so far (T-260, DM decision 2026-11-23): a shape that
 * overlaps it or shares an edge with it joins it into one area (a closed frame leaves a hole);
 * a shape apart from it – also one meeting it at a single corner – starts the area anew.
 * `current` `null`: the shape is the area.
 */
export function addToArea(current: Polygon | null, shape: Polygon): Polygon {
  if (!current) return shape;
  const joined = fromClip(union(asGeom([current]), asGeom([shape])));
  const [only] = joined;
  return joined.length === 1 && only ? only : shape;
}

/** Where the edges of `rings` cross the line at height `y`, sorted (each edge half-open). */
function crossings(
  rings: readonly (readonly (readonly [number, number])[])[],
  y: number,
): number[] {
  const xs: number[] = [];
  for (const ring of rings)
    for (let i = 0; i < ring.length; i += 1) {
      const [x1, y1] = ring[i] ?? [0, 0];
      const [x2, y2] = ring[(i + 1) % ring.length] ?? [0, 0];
      if (y1 <= y !== y2 <= y) xs.push(x1 + ((y - y1) / (y2 - y1)) * (x2 - x1));
    }
  return xs.sort((a, b) => a - b);
}

/**
 * Where an area's name stands (T-260): the middle of its corners if that lies inside the area,
 * else the middle of the widest stretch of the area on a line across it – never in a hole of a
 * closed frame or outside an L. In map pixels.
 */
export function labelPoint(area: Polygon): [number, number] {
  const n = area.outer.length;
  const mx = area.outer.reduce((sum, [x]) => sum + x / n, 0);
  const my = area.outer.reduce((sum, [, y]) => sum + y / n, 0);
  if (isInside([area], [mx, my])) return [mx, my];
  const ys = area.outer.map(([, y]) => y);
  const top = Math.min(...ys);
  const height = Math.max(...ys) - top;
  const rings = [area.outer, ...area.holes];
  for (const share of [0.5, 0.25, 0.75, 0.125, 0.375, 0.625, 0.875]) {
    const y = top + height * share;
    const xs = crossings(rings, y);
    let best: [number, number] | null = null;
    for (let i = 0; i + 1 < xs.length; i += 2) {
      const [from = 0, to = 0] = [xs[i], xs[i + 1]];
      if (!best || to - from > best[1] - best[0]) best = [from, to];
    }
    if (best && best[1] > best[0]) return [(best[0] + best[1]) / 2, y];
  }
  const [first = [mx, my]] = area.outer;
  return [first[0], first[1]];
}
