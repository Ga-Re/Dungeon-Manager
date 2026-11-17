import type { Campaign, Scene } from "@dungeon-manager/schema";

/** The state the session works on: the campaign and the scene currently played. Immutable. */
export interface SessionState {
  readonly campaign: Campaign;
  readonly scene: Scene;
}

/** Injected effects, so `core` stays deterministic (ARCHITECTURE §4). */
export interface Ctx {
  /** Current time in milliseconds since the epoch. */
  readonly now: () => number;
  /** Random number in [0, 1), e.g. for dice. */
  readonly random: () => number;
}
