// Valid sample data for every entity, shared by the schema tests (self-made, not files on disk).
import type {
  Campaign,
  Combatant,
  FogState,
  InitiativeState,
  MapSpec,
  Player,
  Scene,
  Token,
  VisibilityRules,
} from "./index.js";

export const player: Player = {
  id: "player-1",
  name: "Spieler 1",
  characterName: "Aria",
};

export const visibilityRules: VisibilityRules = {
  hp: "approximate",
  trap: "hidden",
};

export const campaign: Campaign = {
  schemaVersion: 1,
  id: "campaign-1",
  name: "Die verlorene Mine",
  players: [player],
  visibilityDefaults: visibilityRules,
};

const hash = `sha256:${"a".repeat(64)}`;

export const map: MapSpec = {
  kind: "video",
  asset: { path: "library/maps/cave.mp4", hash },
  grid: { cellSizePx: 140, offsetXPx: 12, offsetYPx: 0 },
  levels: [
    { id: "level-1", name: "Erdgeschoss" },
    {
      id: "level-2",
      name: "Keller",
      asset: { path: "library/maps/cellar.mp4", hash },
    },
  ],
};

export const token: Token = {
  id: "token-1",
  name: "Goblin",
  size: "small",
  position: { col: 4, row: 7 },
  levelId: "level-1",
  visibility: { name: "hidden" },
};

export const fog: FogState = {
  levels: {
    "level-1": {
      revealed: [
        {
          outer: [
            [0, 0],
            [560, 0],
            [560, 420],
            [0, 420],
          ],
          holes: [
            [
              [140, 140],
              [280, 140],
              [280, 280],
            ],
          ],
        },
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
  conditions: [{ type: "poisoned", remainingRounds: 2 }, { type: "prone" }],
};

/** A player character whose HP the DM does not track. */
const playerCharacter: Combatant = {
  id: "combatant-2",
  name: "Aria",
  initiative: 17,
  conditions: [],
};

export const initiative: InitiativeState = {
  round: 1,
  activeCombatantId: "combatant-2",
  order: ["combatant-2", "combatant-1"],
  combatants: [combatant, playerCharacter],
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
