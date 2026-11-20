import { viewerSceneSchema, type ViewerScene } from "@dungeon-manager/schema";
import { z } from "zod";

/** Version of the message the DM window sends the player window (ARCHITECTURE §7: every message has `v`). */
export const PLAYER_VIEW_VERSION = 1;

/**
 * What the table TV shows: the scene as `projectForViewer` left it for the table, or nothing,
 * and how the view is turned for the players around the table (SPEC 2.2). Strict: anything not
 * listed – such as unprojected scene data – makes the whole message invalid.
 */
export const playerViewMessageSchema = z.strictObject({
  v: z.literal(PLAYER_VIEW_VERSION),
  scene: viewerSceneSchema.nullable(),
  rotation: z.union([
    z.literal(0),
    z.literal(90),
    z.literal(180),
    z.literal(270),
  ]),
  /**
   * The TV's calibration (T-106a/d): its physical pixels per inch and the size of one grid cell in
   * inches, so minis fit. Absent: the whole map fits the TV.
   */
  scale: z
    .strictObject({
      inchPx: z.number().positive(),
      cellInches: z.number().positive(),
    })
    .optional(),
  /** A check square of this many physical pixels for the DM to measure (T-106d). */
  checkSquarePx: z.number().positive().optional(),
  /** Grid lines over the map, from the scene map's grid (T-106b); off when absent. */
  showGrid: z.literal(true).optional(),
});

/** How the TV is calibrated (T-106a). */
export interface PlayerViewScale {
  /** Physical pixels per inch of the TV. */
  readonly inchPx: number;
  /** How big one grid cell is on the TV, in inches (the DM's setting, e.g. 1″ or 2.5 cm). */
  readonly cellInches: number;
}

export interface PlayerViewMessage {
  readonly v: typeof PLAYER_VIEW_VERSION;
  readonly scene: ViewerScene | null;
  readonly rotation: 0 | 90 | 180 | 270;
  readonly scale?: PlayerViewScale | undefined;
  readonly checkSquarePx?: number | undefined;
  readonly showGrid?: true | undefined;
}

/** Validates a received message; `null` if it is not a valid player-view message. */
export function parsePlayerViewMessage(raw: unknown): PlayerViewMessage | null {
  const result = playerViewMessageSchema.safeParse(raw);
  return result.success ? result.data : null;
}
