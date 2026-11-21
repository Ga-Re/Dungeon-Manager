import type { Rotation, Size } from "@dungeon-manager/renderer";
import { createContext } from "react";

/**
 * The calibrated TV as the DM window needs it to show and move its view (T-106c): its size in
 * physical pixels, its physical pixels per grid cell (calibration × cell size) and its
 * rotation. `null` while no calibrated player view runs: the TV then fits the whole map.
 */
export interface TvView {
  readonly display: Size;
  readonly pxPerCell: number;
  readonly rotation: Rotation;
}

export const TvViewContext = createContext<TvView | null>(null);
