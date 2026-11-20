import { describe, expect, test } from "vitest";
import { migrateDocument, sceneDocument, sceneSchema } from "./index.js";

// Scene version 3 (ADR-0012, T-134d): the scene refers to its map; grid and levels move to the
// map's sidecar and wait in `legacyMap` until storage has moved them.

const hash = `sha256:${"a".repeat(64)}`;
const asset = { path: "library/maps/turm.png", hash };
const grid = { cellSizePx: 70, offsetXPx: 5, offsetYPx: 0 };
const levels = [{ id: "ground", name: "Erdgeschoss" }];
const v2 = {
  schemaVersion: 2,
  id: "turm",
  name: "Turm",
  map: { kind: "image", asset, grid, levels, note: "kept" },
  tokens: [],
  fog: { levels: {} },
  initiative: null,
};

describe("scene version 3", () => {
  test("a version 2 map becomes a reference with its grid and levels kept as legacyMap", () => {
    expect(migrateDocument(v2, sceneDocument)).toEqual({
      ...v2,
      schemaVersion: 3,
      map: {
        kind: "image",
        asset,
        note: "kept",
        overrides: {},
        legacyMap: { grid, levels },
      },
    });
  });

  test("a version 2 scene without map stays without", () => {
    expect(migrateDocument({ ...v2, map: null }, sceneDocument).map).toBeNull();
  });

  test("a version 3 map holds no grid or levels of its own", () => {
    const current = {
      ...v2,
      schemaVersion: 3,
      map: { kind: "video", asset, overrides: { hall: { hidden: true } } },
    };
    expect(sceneSchema.parse(current)).toEqual(current);
    expect(
      sceneSchema.safeParse({ ...current, map: { kind: "image", asset } })
        .success,
    ).toBe(false);
  });
});
