// Valid sample data for every entity, shared by the schema tests (self-made, not test fixtures on disk).
import type {
  Campaign,
  Combatant,
  FogState,
  InitiativeState,
  MapSpec,
  Player,
  Scene,
  Token,
  VisibilityRule,
} from "./index.js";

export const player: Player = {
  id: "player-1",
  name: "Spieler 1",
  characterName: "Aria",
};

export const visibilityRule: VisibilityRule = {
  elementType: "hp",
  visibility: "approximate",
};

export const campaign: Campaign = {
  schemaVersion: 1,
  id: "campaign-1",
  name: "Die verlorene Mine",
  players: [player],
  visibilityDefaults: [
    visibilityRule,
    { elementType: "trap", visibility: "hidden" },
  ],
};

export const map: MapSpec = {
  kind: "video",
  asset: { path: "library/maps/cave.mp4", hash: `sha256:${"a".repeat(64)}` },
  grid: { cellSizePx: 140, offsetXPx: 12, offsetYPx: 0 },
  levels: [{ id: "level-1", name: "Erdgeschoss" }],
};

export const token: Token = {
  id: "token-1",
  name: "Goblin",
  size: "small",
  position: { col: 4, row: 7 },
  levelId: "level-1",
  visibility: "visible",
  combatantId: "combatant-1",
};

export const fog: FogState = {
  levels: {
    "level-1": {
      revealed: [
        [
          [0, 0],
          [280, 0],
          [280, 140],
        ],
      ],
      remembered: [],
    },
  },
};

export const combatant: Combatant = {
  id: "combatant-1",
  name: "Goblin",
  tokenId: "token-1",
  initiative: 14,
  hp: { current: 5, max: 7, temp: 0 },
  conditions: [{ id: "poisoned", remainingRounds: 2 }, { id: "prone" }],
};

export const initiative: InitiativeState = {
  round: 1,
  activeCombatantId: "combatant-1",
  order: ["combatant-1"],
  combatants: [combatant],
};

export const scene: Scene = {
  schemaVersion: 1,
  id: "scene-1",
  name: "Mineneingang",
  map,
  tokens: [token],
  fog,
  initiative,
};
