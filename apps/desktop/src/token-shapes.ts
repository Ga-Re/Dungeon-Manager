import { gridFootprint, tokenVisibility } from "@dungeon-manager/core";
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

/**
 * The tokens on `levelId` in map pixels (T-107a): each covers its footprint from its position
 * (the top left cell) on `grid`. A Tiny token takes the middle half of its cell (T-233: up to four
 * share one). In the DM window `selected` tokens get a selection ring, and tokens hidden from the
 * players (by their own setting or the campaign's `defaults`) show faded (T-107b).
 */
export function tokenShapes(
  tokens: readonly PlacedToken[],
  grid: Grid,
  levelId: string,
  selected: ReadonlySet<string> = NONE,
  defaults: VisibilityRules = NO_DEFAULTS,
): TokenShape[] {
  const cell = grid.cellSizePx;
  return tokens
    .filter((token) => token.levelId === levelId)
    .map((token) => {
      const footprint = gridFootprint(token.size);
      const tiny = footprint.share < 1;
      const width = footprint.cols * cell * (tiny ? 0.5 : 1);
      const height = footprint.rows * cell * (tiny ? 0.5 : 1);
      const inset = tiny ? cell / 4 : 0;
      return {
        id: token.id,
        name: token.name,
        x: grid.offsetXPx + token.position.col * cell + inset,
        y: grid.offsetYPx + token.position.row * cell + inset,
        width,
        height,
        // Only when set: the TV's tokens carry neither.
        ...(selected.has(token.id) && { selected: true }),
        ...(tokenVisibility(defaults, token) === "hidden" && { hidden: true }),
      };
    });
}
