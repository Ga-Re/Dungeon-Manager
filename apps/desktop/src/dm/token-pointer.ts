import {
  screenToMap,
  type Camera,
  type Point,
  type Size,
  type TokenShape,
} from "@dungeon-manager/renderer";
import type { Grid, GridCell } from "@dungeon-manager/schema";

// Pointer and key input on tokens in the DM's map view (T-107b), as pure functions of the
// camera, so they are tested without a canvas.

/** The token drawn on top at `point` (map pixels), or `null`: its disc, not its footprint. */
export function tokenAt(
  tokens: readonly TokenShape[],
  point: Point,
): TokenShape | null {
  // Later tokens are drawn on top.
  for (let index = tokens.length - 1; index >= 0; index -= 1) {
    const token = tokens[index];
    if (!token) continue;
    const radius = Math.min(token.width, token.height) / 2;
    const distance = Math.hypot(
      point.x - (token.x + token.width / 2),
      point.y - (token.y + token.height / 2),
    );
    if (distance <= radius) return token;
  }
  return null;
}

/** The whole cells between two map points: a drag snaps to cells (T-107b). */
export function dragCells(start: Point, end: Point, grid: Grid): GridCell {
  const cell = grid.cellSizePx;
  // `+ 0` turns -0 into 0, so an unmoved drag equals { col: 0, row: 0 }.
  return {
    col: Math.round((end.x - start.x) / cell) + 0,
    row: Math.round((end.y - start.y) / cell) + 0,
  };
}

/**
 * The shift that puts `token` on the cell tapped at `point` (map pixels), centred on it for a
 * token of several cells (tap-token-then-tap-cell, T-107b).
 */
export function tapShift(
  token: TokenShape,
  point: Point,
  grid: Grid,
): GridCell {
  const cell = grid.cellSizePx;
  const cols = Math.max(1, Math.round(token.width / cell));
  const rows = Math.max(1, Math.round(token.height / cell));
  // The top left cell of a footprint centred on a point; for the token itself its centre (a
  // Tiny token sits inset in its cell).
  const topLeft = (at: Point) => ({
    col: Math.floor((at.x - grid.offsetXPx) / cell - (cols - 1) / 2),
    row: Math.floor((at.y - grid.offsetYPx) / cell - (rows - 1) / 2),
  });
  const from = topLeft({
    x: token.x + token.width / 2,
    y: token.y + token.height / 2,
  });
  const to = topLeft(point);
  return { col: to.col - from.col + 0, row: to.row - from.row + 0 };
}

/** Screen directions of the arrow keys. */
const ARROWS: Readonly<Record<string, Point>> = {
  ArrowLeft: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
  ArrowUp: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 },
};

/**
 * The one-cell step an arrow key moves tokens on screen: up is up as the DM sees the map, also
 * when the view is rotated. `null` for other keys.
 */
export function arrowStep(
  key: string,
  camera: Camera,
  view: Size,
): GridCell | null {
  const direction = ARROWS[key];
  if (!direction) return null;
  const centre = { x: view.width / 2, y: view.height / 2 };
  const from = screenToMap(camera, view, centre);
  const to = screenToMap(camera, view, {
    x: centre.x + direction.x,
    y: centre.y + direction.y,
  });
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  return Math.abs(dx) >= Math.abs(dy)
    ? { col: Math.sign(dx), row: 0 }
    : { col: 0, row: Math.sign(dy) };
}
