import { describe, expect, it } from "vitest";
import { FOG_BIOMES, fogEffectSchema } from "./common.js";
import { sceneSchema } from "./documents.js";
import { mapDataSchema } from "./sidecar.js";
import { viewerSceneSchema } from "./viewer.js";

// Fog biomes (T-168, ADR-0019): optional and additive in sidecars and scenes (DM, 2026-11-22).

const scene = {
  schemaVersion: 3,
  id: "krypta",
  name: "Krypta",
  map: null,
  tokens: [],
  fog: { levels: {} },
  initiative: null,
};
const map = {
  grid: { cellSizePx: 100, offsetXPx: 0, offsetYPx: 0 },
  levels: [{ id: "level-1", name: "Ebene 1" }],
  rooms: [],
};

describe("fog effect (T-168)", () => {
  it("lists the eight biomes", () => {
    expect(FOG_BIOMES).toEqual([
      "nebel",
      "schnee",
      "wueste",
      "asche",
      "sumpf",
      "kueste",
      "arkan",
      "dunkel",
    ]);
  });

  it("is optional in scenes and map data, and kept when set", () => {
    expect(sceneSchema.parse(scene).fogEffect).toBeUndefined();
    expect(mapDataSchema.parse(map).fogEffect).toBeUndefined();
    const effect = { biome: "schnee", strength: 0.6 };
    expect(
      sceneSchema.parse({ ...scene, fogEffect: effect }).fogEffect,
    ).toEqual(effect);
    expect(
      mapDataSchema.parse({ ...map, fogEffect: effect }).fogEffect,
    ).toEqual(effect);
  });

  it("keeps a biome of a newer app in files, but rejects a strength out of range", () => {
    expect(fogEffectSchema.parse({ biome: "vulkan2", strength: 1 }).biome).toBe(
      "vulkan2",
    );
    expect(
      fogEffectSchema.safeParse({ biome: "nebel", strength: 1.5 }).success,
    ).toBe(false);
    expect(fogEffectSchema.safeParse({ biome: "", strength: 1 }).success).toBe(
      false,
    );
  });

  it("reaches the TV only with a known biome", () => {
    const viewer = {
      id: "krypta",
      name: "Krypta",
      map: null,
      fog: {},
      tokens: [],
    };
    expect(
      viewerSceneSchema.parse({
        ...viewer,
        fogEffect: { biome: "asche", strength: 1 },
      }).fogEffect,
    ).toEqual({ biome: "asche", strength: 1 });
    expect(
      viewerSceneSchema.safeParse({
        ...viewer,
        fogEffect: { biome: "vulkan2", strength: 1 },
      }).success,
    ).toBe(false);
  });
});
