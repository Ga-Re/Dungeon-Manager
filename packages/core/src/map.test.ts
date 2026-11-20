import type { MapData, Polygon, Scene } from "@dungeon-manager/schema";
import { describe, expect, test } from "vitest";
import { levelsInUse, removeLevel, resolveMap } from "./index.js";
import { deepFreeze, scene, square } from "./test-data.test-data.js";

// Global map data plus a scene's overrides (ADR-0012, T-134).

const hash = `sha256:${"d".repeat(64)}`;
const asset = { path: "library/maps/turm.png", hash };

const tower: MapData = deepFreeze({
  grid: { cellSizePx: 70, offsetXPx: 5, offsetYPx: 10 },
  levels: [
    { id: "ground", name: "Erdgeschoss" },
    { id: "cellar", name: "Keller", archived: true },
    { id: "attic", name: "Dachboden" },
  ],
  rooms: [
    { id: "hall", name: "Halle", area: square(0, 0, 100) },
    { id: "guards", name: "Wachraum", area: square(100, 0, 100) },
  ],
});

const defaultLevel = { id: "level-1", name: "Ebene 1" };

describe("resolveMap", () => {
  test("takes grid, levels and rooms from the sidecar", () => {
    const { map, orphanedOverrides } = resolveMap({
      kind: "image",
      asset,
      data: tower,
      overrides: {},
      defaultLevel,
    });
    expect(map).toEqual({ kind: "image", asset, ...tower });
    expect(orphanedOverrides).toEqual([]);
  });

  test("a map without sidecar gets a placeholder grid and one level", () => {
    const { map } = resolveMap({
      kind: "video",
      asset,
      data: null,
      overrides: {},
      defaultLevel,
    });
    expect(map).toEqual({
      kind: "video",
      asset,
      grid: { cellSizePx: 100, offsetXPx: 0, offsetYPx: 0 },
      levels: [defaultLevel],
      rooms: [],
    });
  });

  test("a scene renames, reshapes or leaves out a room", () => {
    const smaller: Polygon = square(0, 0, 50);
    const { map, orphanedOverrides } = resolveMap({
      kind: "image",
      asset,
      data: tower,
      overrides: {
        hall: { name: "Thronsaal", area: smaller },
        guards: { hidden: true },
      },
      defaultLevel,
    });
    expect(map.rooms).toEqual([
      { id: "hall", name: "Thronsaal", area: smaller },
    ]);
    expect(orphanedOverrides).toEqual([]);
    // The global data is unchanged.
    expect(tower.rooms[0]?.name).toBe("Halle");
  });

  test("overrides of missing elements are kept inactive and reported", () => {
    const { map, orphanedOverrides } = resolveMap({
      kind: "image",
      asset,
      data: tower,
      overrides: {
        "deleted-room": { hidden: true },
        // Levels belong to the map in every scene and cannot be overridden.
        ground: { name: "Anders" },
      },
      defaultLevel,
    });
    expect(map.levels[0]?.name).toBe("Erdgeschoss");
    expect(orphanedOverrides).toEqual(["deleted-room", "ground"]);
  });
});

describe("levels in use", () => {
  const using: Scene = {
    ...scene,
    tokens: scene.tokens.slice(0, 1).map((token) => ({
      ...token,
      levelId: "token-level",
    })),
    fog: { levels: { "fog-level": { revealed: [], remembered: [] } } },
    table: { levelId: "tv-level", shownLevelIds: ["shown-level"] },
  };

  test("are the levels a scene's fog, tokens or TV state refer to", () => {
    expect([...levelsInUse(using)].sort()).toEqual([
      "fog-level",
      "shown-level",
      "token-level",
      "tv-level",
    ]);
  });

  test("a level no scene uses is removed", () => {
    const result = removeLevel(tower, "ground", [using]);
    expect(result).toEqual({
      kind: "removed",
      data: { ...tower, levels: tower.levels.slice(1) },
    });
  });

  test("a level a scene still uses is archived, never deleted", () => {
    const result = removeLevel(tower, "ground", [
      { ...using, id: "scene-a", tokens: [] },
      {
        ...using,
        id: "scene-b",
        fog: { levels: { ground: { revealed: [], remembered: [] } } },
      },
    ]);
    expect(result).toEqual({
      kind: "archived",
      usedBy: ["scene-b"],
      data: {
        ...tower,
        levels: [
          { id: "ground", name: "Erdgeschoss", archived: true },
          ...tower.levels.slice(1),
        ],
      },
    });
  });

  test("the only level that is not archived stays, also when scenes use it", () => {
    const single: MapData = {
      ...tower,
      levels: [{ id: "ground", name: "EG" }],
    };
    expect(removeLevel(single, "ground", [])).toEqual({ kind: "lastLevel" });
    const nextToArchived: MapData = {
      ...tower,
      levels: [
        { id: "ground", name: "EG" },
        { id: "cellar", name: "Keller", archived: true },
      ],
    };
    expect(removeLevel(nextToArchived, "ground", [])).toEqual({
      kind: "lastLevel",
    });
    expect(removeLevel(nextToArchived, "ground", [scene])).toEqual({
      kind: "lastLevel",
    });
    // An archived level no scene uses any more can go.
    expect(removeLevel(nextToArchived, "cellar", [])).toMatchObject({
      kind: "removed",
    });
  });

  test("unknown levels are reported", () => {
    expect(removeLevel(tower, "basement", [])).toEqual({
      kind: "unknownLevel",
    });
  });
});
