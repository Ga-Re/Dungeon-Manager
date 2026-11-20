import type { Campaign, Scene } from "@dungeon-manager/schema";
import type { ResolvedMap } from "./map.js";

/**
 * The state the session works on: the campaign, the scene currently played and its map as
 * resolved from the map's global data and the scene's overrides (`resolveMap`, ADR-0012).
 * Immutable; `null` map for a scene without one.
 */
export interface SessionState {
  readonly campaign: Campaign;
  readonly scene: Scene;
  readonly map: ResolvedMap | null;
}

/** Injected effects, so `core` stays deterministic (ARCHITECTURE §4). */
export interface Ctx {
  /** Current time in milliseconds since the epoch. */
  readonly now: () => number;
  /** Random number in [0, 1), e.g. for dice. */
  readonly random: () => number;
}
