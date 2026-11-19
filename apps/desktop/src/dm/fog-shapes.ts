import {
  circleArea,
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

/** How the DM marks an area to reveal or hide (SPEC 4). */
export type FogShape = "rectangle" | "circle" | "polygon" | "brush";

/** Polygons smaller than this (square map pixels) enclose nothing worth a command. */
const MIN_POLYGON_AREA = 1;

/** Smaller drags are taken as slips, not areas. */
export const MIN_DRAG_PX = 4;

const toMap = (camera: Camera, view: Size, point: Point): [number, number] => {
  const mapped = screenToMap(camera, view, point);
  return [mapped.x, mapped.y];
};

/**
 * The area of a rectangle or circle dragged from `start` to `end` (screen pixels): the rectangle
 * between them, its corners rounded by `cornerRadius` map pixels (T-170), or the circle around
 * `start` through `end`. `null` for a slip.
 */
export function dragArea(
  shape: "rectangle" | "circle",
  start: Point,
  end: Point,
  camera: Camera,
  view: Size,
  cornerRadius = 0,
): Polygon | null {
  if (shape === "circle") {
    const radius = Math.hypot(end.x - start.x, end.y - start.y);
    if (radius < MIN_DRAG_PX) return null;
    return circleArea(toMap(camera, view, start), radius / camera.zoom);
  }
  if (
    Math.abs(end.x - start.x) < MIN_DRAG_PX ||
    Math.abs(end.y - start.y) < MIN_DRAG_PX
  )
    return null;
  // The view turns in quarter turns only, so the dragged corners are opposite corners of an
  // axis-aligned rectangle on the map too.
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

/** A clicked polygon (map pixels), if it has enough corners to enclose anything. */
export function polygonArea(
  points: readonly (readonly [number, number])[],
): Polygon | null {
  // Fewer than three corners, or all on one line: nothing enclosed, nothing to reveal.
  if (points.length < 3 || ringArea(points) < MIN_POLYGON_AREA) return null;
  return { outer: points.map(([x, y]): [number, number] => [x, y]), holes: [] };
}
