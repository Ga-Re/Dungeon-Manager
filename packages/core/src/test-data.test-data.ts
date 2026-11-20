// Self-made sample session for the core tests.
import type {
  Campaign,
  Combatant,
  Polygon,
  Scene,
} from "@dungeon-manager/schema";
import type { Ctx, SessionState } from "./index.js";

export const ctx: Ctx = { now: () => 1_000, random: () => 0.5 };

const hash = `sha256:${"b".repeat(64)}`;

export const campaign: Campaign = {
  schemaVersion: 2,
  id: "campaign-1",
  name: "Testkampagne",
  players: [{ id: "player-1", name: "Spieler 1" }],
  visibilityDefaults: { hp: "approximate" },
};

export const goblin: Combatant = {
  id: "goblin",
  name: "Goblin",
  tokenId: "token-goblin",
  initiative: 12,
  hp: { current: 7, max: 7, temp: 0 },
  conditions: [],
};

export const scene: Scene = {
  schemaVersion: 2,
  id: "scene-1",
  name: "Höhle",
  map: {
    kind: "image",
    asset: { path: "library/maps/cave.png", hash },
    grid: { cellSizePx: 100, offsetXPx: 0, offsetYPx: 0 },
    levels: [
      { id: "ground", name: "Erdgeschoss" },
      { id: "cellar", name: "Keller" },
    ],
  },
  tokens: [
    {
      id: "token-goblin",
      name: "Goblin",
      size: "small",
      position: { col: 1, row: 1 },
      levelId: "ground",
    },
    {
      id: "token-aria",
      name: "Aria",
      size: "medium",
      position: { col: 2, row: 2 },
      levelId: "ground",
    },
  ],
  fog: { levels: {} },
  initiative: null,
};

/**
 * A session on `scene`, its map resolved from the map the scene file still embeds (scene
 * version 2; the sidecar takes over its grid and levels in T-134c).
 */
export function sessionOf(scene: Scene, of: Campaign = campaign): SessionState {
  return {
    campaign: of,
    scene,
    map: scene.map
      ? {
          kind: scene.map.kind,
          asset: scene.map.asset,
          grid: scene.map.grid,
          levels: scene.map.levels,
          rooms: [],
        }
      : null,
  };
}

export const state: SessionState = sessionOf(scene);

/** An axis-aligned square in map pixels. */
export function square(x: number, y: number, size: number): Polygon {
  return {
    outer: [
      [x, y],
      [x + size, y],
      [x + size, y + size],
      [x, y + size],
    ],
    holes: [],
  };
}

/** Freezes a value deeply, so tests catch accidental mutation of the input state. */
export function deepFreeze<T>(value: T): T {
  if (typeof value === "object" && value !== null) {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}
