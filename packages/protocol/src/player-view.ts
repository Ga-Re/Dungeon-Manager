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
});

export interface PlayerViewMessage {
  readonly v: typeof PLAYER_VIEW_VERSION;
  readonly scene: ViewerScene | null;
  readonly rotation: 0 | 90 | 180 | 270;
}

/** Validates a received message; `null` if it is not a valid player-view message. */
export function parsePlayerViewMessage(raw: unknown): PlayerViewMessage | null {
  const result = playerViewMessageSchema.safeParse(raw);
  return result.success ? result.data : null;
}
