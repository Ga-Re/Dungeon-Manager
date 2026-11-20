import { describe, expect, test } from "vitest";
import {
  mapOverridesSchema,
  migrateDocument,
  sidecarDocument,
  sidecarSchema,
} from "./index.js";

// Sidecar files `<file>.dm.json` (ADR-0012, T-134; format agreed with the DM, 2026-11-20).

const hash = `sha256:${"c".repeat(64)}`;
const square = {
  outer: [
    [0, 0],
    [100, 0],
    [100, 100],
  ],
  holes: [],
};

const tower = {
  schemaVersion: 1,
  original: { hash },
  map: {
    grid: { cellSizePx: 100, offsetXPx: 0, offsetYPx: 0 },
    levels: [
      { id: "ground", name: "Erdgeschoss" },
      {
        id: "cellar",
        name: "Keller",
        asset: { path: "library/maps/keller.png", hash },
        archived: true,
      },
    ],
    rooms: [{ id: "guard-room", name: "Wachraum", area: square }],
  },
};

describe("sidecar files", () => {
  test("hold a map's grid, levels and rooms and round-trip unchanged", () => {
    const parsed = migrateDocument(tower, sidecarDocument);
    expect(parsed).toEqual(tower);
    expect(sidecarSchema.parse(JSON.parse(JSON.stringify(parsed)))).toEqual(
      tower,
    );
  });

  test("keep fields of later tasks (tags, walls), written by a newer app", () => {
    const later = {
      ...tower,
      tags: ["Turm"],
      map: { ...tower.map, walls: [{ id: "w1" }] },
    };
    expect(sidecarSchema.parse(later)).toEqual(later);
  });

  test("may describe a file that is no map (assets, T-125)", () => {
    expect(
      sidecarSchema.safeParse({ schemaVersion: 1, original: { hash } }).success,
    ).toBe(true);
  });

  test("every element id is unique across levels and rooms", () => {
    const clash = {
      ...tower,
      map: {
        ...tower.map,
        rooms: [{ id: "ground", name: "Halle", area: square }],
      },
    };
    expect(sidecarSchema.safeParse(clash).success).toBe(false);
  });

  test("a map has at least one level", () => {
    const empty = { ...tower, map: { ...tower.map, levels: [] } };
    expect(sidecarSchema.safeParse(empty).success).toBe(false);
  });
});

describe("scene overrides of map elements", () => {
  test("are keyed by element id and change name, area or presence", () => {
    const overrides = {
      "guard-room": { name: "Leerer Raum", hidden: true },
      "secret-room": { area: square },
    };
    expect(mapOverridesSchema.parse(overrides)).toEqual(overrides);
  });

  test("refuse ids that are no valid element ids", () => {
    expect(mapOverridesSchema.safeParse({ "Raum 1": {} }).success).toBe(false);
  });
});
