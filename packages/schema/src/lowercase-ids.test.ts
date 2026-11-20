import { describe, expect, test } from "vitest";
import {
  campaignDocument,
  idSchema,
  MigrationError,
  migrateDocument,
  sceneDocument,
  sessionDocument,
} from "./index.js";

// T-119 (DM decision, 2026-11-20): ids are lowercase, because they name files and `Scene-1`
// and `scene-1` are the same file on macOS and Windows. Version 1 files may hold mixed case.

const asset = {
  path: "library/maps/turm.png",
  hash: `sha256:${"a".repeat(64)}`,
};

describe("lowercase ids", () => {
  test("ids allow only lowercase letters, digits, '-' and '_'", () => {
    expect(idSchema.safeParse("goblin-camp_2").success).toBe(true);
    expect(idSchema.safeParse("Scene-1").success).toBe(false);
  });

  test("a version 1 campaign gets lowercase ids", () => {
    const campaign = migrateDocument(
      {
        schemaVersion: 1,
        id: "Mine",
        name: "Mine",
        players: [{ id: "Anna", name: "Anna" }],
        visibilityDefaults: {},
      },
      campaignDocument,
    );
    expect(campaign).toMatchObject({
      schemaVersion: 2,
      id: "mine",
      players: [{ id: "anna", name: "Anna" }],
    });
  });

  test("a version 1 scene lowercases every id and every reference to it", () => {
    const scene = migrateDocument(
      {
        schemaVersion: 1,
        id: "Turm",
        name: "Turm",
        parentSceneId: "Stadt",
        map: {
          kind: "image",
          asset,
          grid: { cellSizePx: 100, offsetXPx: 0, offsetYPx: 0 },
          levels: [
            { id: "Ground", name: "Erdgeschoss" },
            { id: "Cellar", name: "Keller" },
          ],
        },
        tokens: [
          {
            id: "Goblin",
            name: "Goblin",
            size: "small",
            position: { col: 1, row: 2 },
            levelId: "Cellar",
            ownerPlayerId: "Anna",
          },
        ],
        fog: {
          levels: { Ground: { revealed: [], remembered: [] } },
        },
        initiative: {
          round: 1,
          activeCombatantId: "Fighter",
          order: ["Fighter"],
          combatants: [
            {
              id: "Fighter",
              name: "Kämpfer",
              tokenId: "Goblin",
              initiative: 12,
              conditions: [],
            },
          ],
        },
        table: { levelId: "Cellar", shownLevelIds: ["Ground", "Cellar"] },
      },
      sceneDocument,
    );
    // Version 1 scenes go on to version 3: grid and levels wait in `legacyMap` (T-134d).
    expect(scene).toMatchObject({
      schemaVersion: 3,
      id: "turm",
      name: "Turm",
      parentSceneId: "stadt",
      map: { legacyMap: { levels: [{ id: "ground" }, { id: "cellar" }] } },
      tokens: [{ id: "goblin", levelId: "cellar", ownerPlayerId: "anna" }],
      fog: { levels: { ground: { revealed: [] } } },
      initiative: {
        activeCombatantId: "fighter",
        order: ["fighter"],
        combatants: [{ id: "fighter", tokenId: "goblin" }],
      },
      table: { levelId: "cellar", shownLevelIds: ["ground", "cellar"] },
    });
  });

  test("a version 1 scene without map, initiative or table stays valid", () => {
    const scene = migrateDocument(
      {
        schemaVersion: 1,
        id: "leer",
        name: "Leer",
        map: null,
        tokens: [],
        fog: { levels: {} },
        initiative: null,
      },
      sceneDocument,
    );
    expect(scene).toMatchObject({ schemaVersion: 3, id: "leer", map: null });
  });

  test("a version 1 session lowercases its scene list", () => {
    const session = migrateDocument(
      { schemaVersion: 1, id: "Abend-1", name: "Abend", sceneIds: ["Turm"] },
      sessionDocument,
    );
    expect(session).toMatchObject({
      schemaVersion: 2,
      id: "abend-1",
      sceneIds: ["turm"],
    });
  });

  test("two tokens whose ids differ only in case are refused", () => {
    const token = (id: string) => ({
      id,
      name: "Goblin",
      size: "small",
      position: { col: 0, row: 0 },
      levelId: "ground",
    });
    expect(() =>
      migrateDocument(
        {
          schemaVersion: 1,
          id: "s",
          name: "S",
          map: null,
          tokens: [token("Goblin"), token("goblin")],
          fog: { levels: {} },
          initiative: null,
        },
        sceneDocument,
      ),
    ).toThrow(new MigrationError("idCollision", 1));
  });

  test("two fog levels whose ids differ only in case are refused instead of merged", () => {
    expect(() =>
      migrateDocument(
        {
          schemaVersion: 1,
          id: "s",
          name: "S",
          map: null,
          tokens: [],
          fog: {
            levels: {
              A: { revealed: [], remembered: [] },
              a: { revealed: [], remembered: [] },
            },
          },
          initiative: null,
        },
        sceneDocument,
      ),
    ).toThrow(new MigrationError("idCollision", 1));
  });
});
