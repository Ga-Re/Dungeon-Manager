import {
  ellipseArea,
  ringArea,
  roundedRectArea,
  strokeArea,
} from "@dungeon-manager/core";
import {
  screenToMap,
  type Camera,
  type Point,
  type Size,
} from "@dungeon-manager/renderer";
import type { Polygon } from "@dungeon-manager/schema";

/** How the DM marks an area to reveal or hide (SPEC 4; ellipse and lasso since T-247). */
export type FogShape = "rectangle" | "ellipse" | "polygon" | "lasso" | "brush";

/** Polygons smaller than this (square map pixels) enclose nothing worth a command. */
const MIN_POLYGON_AREA = 1;

/** Smaller drags are taken as slips, not areas. */
export const MIN_DRAG_PX = 4;

const toMap = (camera: Camera, view: Size, point: Point): [number, number] => {
  const mapped = screenToMap(camera, view, point);
  return [mapped.x, mapped.y];
};

/**
 * The end of a drag from `start` made square (Shift with the ellipse: a circle), on the longer
 * side of the dragged box, in the direction dragged.
 */
export function squareEnd(start: Point, end: Point): Point {
  const side = Math.max(Math.abs(end.x - start.x), Math.abs(end.y - start.y));
  return {
    x: start.x + (end.x < start.x ? -side : side),
    y: start.y + (end.y < start.y ? -side : side),
  };
}

/**
 * The area of a rectangle or ellipse dragged from `start` to `end` (screen pixels): the
 * rectangle between them, its corners rounded by `cornerRadius` map pixels (T-170), or the
 * ellipse around `start` reaching to `end` on both axes (T-247: drawn from its middle, DM
 * decision 2026-11-22, so it can be put around a token). `null` for a slip.
 */
export function dragArea(
  shape: "rectangle" | "ellipse",
  start: Point,
  end: Point,
  camera: Camera,
  view: Size,
  cornerRadius = 0,
): Polygon | null {
  if (
    Math.abs(end.x - start.x) < MIN_DRAG_PX ||
    Math.abs(end.y - start.y) < MIN_DRAG_PX
  )
    return null;
  // The view turns in quarter turns only, so the dragged corners are opposite corners of an
  // axis-aligned box on the map too (for the ellipse: its box around where the drag started).
  if (shape === "ellipse")
    return ellipseArea(
      toMap(camera, view, {
        x: 2 * start.x - end.x,
        y: 2 * start.y - end.y,
      }),
      toMap(camera, view, end),
    );
  if (cornerRadius > 0)
    return roundedRectArea(
      toMap(camera, view, start),
      toMap(camera, view, end),
      cornerRadius,
    );
  // All four corners: with the view rotated, a screen rectangle is still a map rectangle, but
  // its corners swap places.
  const corners = [
    start,
    { x: end.x, y: start.y },
    end,
    { x: start.x, y: end.y },
  ];
  return {
    outer: corners.map((corner) => toMap(camera, view, corner)),
    holes: [],
  };
}

/** The area a brush stroke along `points` (screen pixels) covers; `radius` in map pixels. */
export function brushArea(
  points: readonly Point[],
  radius: number,
  camera: Camera,
  view: Size,
): Polygon | null {
  return strokeArea(
    points.map((point) => toMap(camera, view, point)),
    radius,
  );
}

/** Lasso points closer than this (screen pixels) to the last one add nothing. */
const LASSO_STEP_PX = 3;

/**
 * The area a freehand loop along `points` (screen pixels) encloses, closed from its last point
 * back to its first (T-247); `null` if it encloses nothing.
 */
export function lassoArea(
  points: readonly Point[],
  camera: Camera,
  view: Size,
): Polygon | null {
  const kept: Point[] = [];
  for (const point of points) {
    const last = kept.at(-1);
    if (last && Math.hypot(point.x - last.x, point.y - last.y) < LASSO_STEP_PX)
      continue;
    kept.push(point);
  }
  return polygonArea(kept.map((point) => toMap(camera, view, point)));
}

/** A clicked polygon (map pixels), if it has enough corners to enclose anything. */
export function polygonArea(
  points: readonly (readonly [number, number])[],
): Polygon | null {
  // Fewer than three corners, or all on one line: nothing enclosed, nothing to reveal.
  if (points.length < 3 || ringArea(points) < MIN_POLYGON_AREA) return null;
  return { outer: points.map(([x, y]): [number, number] => [x, y]), holes: [] };
}
