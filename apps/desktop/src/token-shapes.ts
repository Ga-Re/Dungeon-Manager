import {
  gridFootprint,
  tinyCentres,
  tokenVisibility,
} from "@dungeon-manager/core";
import type { TokenShape } from "@dungeon-manager/renderer";
import type {
  GridCell,
  Grid,
  TokenSize,
  VisibilityRules,
} from "@dungeon-manager/schema";

/** What drawing needs of a token: the scene's tokens and the TV's projected ones alike. */
export interface PlacedToken {
  readonly id: string;
  readonly name?: string | undefined;
  readonly size: TokenSize;
  readonly position: GridCell;
  readonly levelId: string;
  /** The scene's tokens only; projected tokens have it removed. */
  readonly visibility?: VisibilityRules | undefined;
}

const NONE: ReadonlySet<string> = new Set();
const NO_DEFAULTS: VisibilityRules = {};

/** How much of its cell a Small token is drawn at (DM decision, 2026-11-21); it still takes it. */
const SMALL_SCALE = 0.75;

/**
 * The tokens on `levelId` in map pixels (T-107a): each covers its footprint from its position
 * (the top left cell) on `grid`. A Tiny token is half a cell wide; Tiny tokens on one cell
 * arrange themselves by how many there are (T-233c) – only those given count, so the TV's
 * arrangement shows nothing of hidden ones. A Small token is drawn at 75 % of its cell. In the
 * DM window `selected` tokens get a selection ring, and tokens hidden from the players (by their
 * own setting or the campaign's `defaults`) show faded (T-107b).
 */
export function tokenShapes(
  tokens: readonly PlacedToken[],
  grid: Grid,
  levelId: string,
  selected: ReadonlySet<string> = NONE,
  defaults: VisibilityRules = NO_DEFAULTS,
  /** The token whose turn it is (T-111c): drawn with a bright ring. */
  activeTokenId: string | null = null,
): TokenShape[] {
  const cell = grid.cellSizePx;
  const onLevel = tokens.filter((token) => token.levelId === levelId);
  // Tiny tokens on one cell arrange by count (core: the same spots keep free tokens apart).
  const centres = tinyCentres(onLevel);
  return onLevel.map((token) => {
    const footprint = gridFootprint(token.size);
    const left = grid.offsetXPx + token.position.col * cell;
    const top = grid.offsetYPx + token.position.row * cell;
    let box = {
      x: left,
      y: top,
      width: footprint.cols * cell,
      height: footprint.rows * cell,
    };
    const centre = centres.get(token.id);
    if (centre) {
      box = {
        x: grid.offsetXPx + (centre.col - 0.25) * cell,
        y: grid.offsetYPx + (centre.row - 0.25) * cell,
        width: cell / 2,
        height: cell / 2,
      };
    } else if (token.size === "small") {
      const inset = ((1 - SMALL_SCALE) * cell) / 2;
      box = {
        x: left + inset,
        y: top + inset,
        width: cell * SMALL_SCALE,
        height: cell * SMALL_SCALE,
      };
    }
    return {
      id: token.id,
      name: token.name,
      ...box,
      // Only when set: the TV's tokens carry neither.
      ...(selected.has(token.id) && { selected: true }),
      ...(tokenVisibility(defaults, token) === "hidden" && { hidden: true }),
      ...(token.id === activeTokenId && { active: true }),
    };
  });
}
