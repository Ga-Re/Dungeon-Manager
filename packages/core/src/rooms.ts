import type { Grid, Polygon, Room } from "@dungeon-manager/schema";

// Rooms of a map (T-108c1, SPEC 4, ADR-0012; DM decisions 2026-11-22): drawn once per level
// in the map's sidecar, so every scene of the map has them.

/** The shapes a room is drawn with; a lasso is free-hand and never snaps. */
export type RoomShape = "rectangle" | "polygon" | "ellipse" | "lasso";

/** The rooms on `levelId`; a room without a level lies on the map's first level. */
export function roomsOnLevel<T extends Pick<Room, "levelId">>(
  rooms: readonly T[],
  levels: readonly { readonly id: string }[],
  levelId: string,
): T[] {
  const first = levels[0]?.id;
  return rooms.filter((room) => (room.levelId ?? first) === levelId);
}

/** A room id not yet taken by the map's levels or rooms: `room-1`, `room-2`, … */
export function newRoomId(taken: readonly string[]): string {
  const used = new Set(taken);
  let number = 1;
  while (used.has(`room-${String(number)}`)) number += 1;
  return `room-${String(number)}`;
}

/** The nearest grid line position to `value` on one axis. */
function snap(value: number, cell: number, offset: number): number {
  return Math.round((value - offset) / cell) * cell + offset;
}

/** Whether a ring encloses some area, so a snapped room is not a line or a point. */
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
 * A drawn room snapped to the grid (DM decision): a rectangle's or polygon's corners move to the
 * nearest grid points, an ellipse is fitted into its bounding box snapped to the grid, a lasso
 * stays as drawn. `null` when it snaps to nothing (narrower than half a cell).
 */
export function snapArea(
  area: Polygon,
  grid: Grid,
  shape: RoomShape,
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
