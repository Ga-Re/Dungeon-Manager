import { describe, expect, test } from "vitest";
import type { ZodType } from "zod";
import * as samples from "./fixtures.test-data.js";
import {
  campaignSchema,
  combatantSchema,
  fogStateSchema,
  initiativeStateSchema,
  legacyMapSchema,
  playerSchema,
  sceneMapSchema,
  sceneSchema,
  tokenSchema,
  visibilityRulesSchema,
} from "./index.js";

/** Every entity with its schema and a valid sample. */
const entities: [string, ZodType, unknown][] = [
  ["Campaign", campaignSchema, samples.campaign],
  ["Scene", sceneSchema, samples.scene],
  ["Scene map", sceneMapSchema, samples.sceneMap],
  ["Legacy map", legacyMapSchema, samples.legacyMap],
  ["Token", tokenSchema, samples.token],
  ["FogState", fogStateSchema, samples.fog],
  ["InitiativeState", initiativeStateSchema, samples.initiative],
  ["Combatant", combatantSchema, samples.combatant],
  ["VisibilityRules", visibilityRulesSchema, samples.visibilityRules],
  ["Player", playerSchema, samples.player],
];

/** What a file round-trip does: parse, serialise to JSON text, parse again. */
function roundTrip(schema: ZodType, value: unknown): unknown {
  const parsed = schema.parse(value);
  return schema.parse(JSON.parse(JSON.stringify(parsed)));
}

describe.each(entities)("%s", (_name, schema, sample) => {
  test("round-trips unchanged (parse → serialize → parse)", () => {
    expect(roundTrip(schema, sample)).toEqual(sample);
  });

  test("keeps unknown fields, e.g. written by a newer app version", () => {
    // Visibility rules are keyed by element type; an unknown type is rejected, not kept.
    if (schema === visibilityRulesSchema) return;
    const withExtra = { ...(sample as object), addedLater: { nested: [1, 2] } };
    expect(roundTrip(schema, withExtra)).toEqual(withExtra);
  });
});

describe("unknown fields in nested objects", () => {
  test("are kept inside a scene's tokens and map", () => {
    const scene = {
      ...samples.scene,
      tokens: [{ ...samples.token, aura: "fire" }],
      map: { ...samples.sceneMap, frame: { style: "hex" } },
    };
    expect(roundTrip(sceneSchema, scene)).toEqual(scene);
  });
});

const asset = samples.sceneMap.asset;
const withPath = (path: string) => ({
  ...samples.sceneMap,
  asset: { ...asset, path },
});
const ring = (offset: number): [number, number][] => [
  [offset, 0],
  [offset + 1, 0],
  [offset, 1],
];
const initiativeWith = (changes: object) => ({
  ...samples.initiative,
  ...changes,
});

describe("validation", () => {
  test.each([
    [
      "a negative grid cell",
      tokenSchema,
      { ...samples.token, position: { col: -1, row: 0 } },
    ],
    [
      "an endless position",
      tokenSchema,
      { ...samples.token, position: { col: Infinity, row: 0 } },
    ],
    [
      "an unknown token size",
      tokenSchema,
      { ...samples.token, size: "colossal" },
    ],
    ["an unknown visibility", visibilityRulesSchema, { hp: "maybe" }],
    [
      "an unknown visibility element type",
      visibilityRulesSchema,
      { aura: "hidden" },
    ],
    [
      "a hash in the wrong format",
      sceneMapSchema,
      { ...samples.sceneMap, asset: { ...asset, hash: "md5:abc" } },
    ],
    [
      "a non-positive cell size",
      legacyMapSchema,
      {
        ...samples.legacyMap,
        grid: { ...samples.legacyMap.grid, cellSizePx: 0 },
      },
    ],
    [
      "a map without levels",
      legacyMapSchema,
      { ...samples.legacyMap, levels: [] },
    ],
    [
      "temporary HP below zero",
      combatantSchema,
      { ...samples.combatant, hp: { current: 1, max: 1, temp: -1 } },
    ],
    [
      "a ring with fewer than three points",
      fogStateSchema,
      {
        levels: {
          l: {
            revealed: [
              {
                outer: [
                  [0, 0],
                  [1, 1],
                ],
                holes: [],
              },
            ],
            remembered: [],
          },
        },
      },
    ],
    [
      "a hole with fewer than three points",
      fogStateSchema,
      {
        levels: {
          l: {
            revealed: [{ outer: ring(0), holes: [[[0, 0]]] }],
            remembered: [],
          },
        },
      },
    ],
    [
      "a scene with another schema version",
      sceneSchema,
      { ...samples.scene, schemaVersion: 1 },
    ],
    ["an empty id", playerSchema, { ...samples.player, id: "" }],
    [
      "an id with a path separator",
      playerSchema,
      { ...samples.player, id: "../x" },
    ],
    ["an id with a dot", playerSchema, { ...samples.player, id: "a.b" }],
    [
      "an id with a capital letter",
      playerSchema,
      { ...samples.player, id: "Anna" },
    ],
    [
      "an order missing a combatant",
      initiativeStateSchema,
      initiativeWith({ order: ["combatant-1"] }),
    ],
    [
      "an order with an unknown id",
      initiativeStateSchema,
      initiativeWith({ order: ["combatant-1", "combatant-2", "ghost"] }),
    ],
    [
      "an order with a duplicate",
      initiativeStateSchema,
      initiativeWith({ order: ["combatant-1", "combatant-1", "combatant-2"] }),
    ],
    [
      "duplicate combatant ids",
      initiativeStateSchema,
      initiativeWith({ combatants: [samples.combatant, samples.combatant] }),
    ],
    [
      "an active combatant outside the order",
      initiativeStateSchema,
      initiativeWith({ activeCombatantId: "ghost" }),
    ],
  ])("rejects %s", (_case, schema, value) => {
    expect(schema.safeParse(value).success).toBe(false);
  });

  // Defence in depth only: storage additionally resolves paths against the library root.
  test.each([
    "/etc/passwd",
    "C:/maps/x.png",
    "maps\\x.png",
    "maps/../../x.png",
    "./maps/x.png",
    ".",
    "",
    "maps//x.png",
    "maps/x.png/",
    "~/x.png",
    "maps/x\u0000.png",
    "maps/a:b.png",
    " ../x.png",
    "maps/x.png.",
    "%2e%2e/x.png",
    "maps/..%2fx.png",
  ])("rejects the asset path %j", (path) => {
    expect(sceneMapSchema.safeParse(withPath(path)).success).toBe(false);
  });

  test.each([
    "library/maps/cave.mp4",
    "library/maps/Höhle (alt) – 2.webm",
    "x.png",
  ])("accepts the asset path %j", (path) => {
    expect(sceneMapSchema.safeParse(withPath(path)).success).toBe(true);
  });

  test("accepts combat without an active combatant", () => {
    expect(
      initiativeStateSchema.safeParse(
        initiativeWith({ round: 0, activeCombatantId: null }),
      ).success,
    ).toBe(true);
  });
});

describe("token positions (T-233)", () => {
  test("may be fractional: a token placed freely between cells", () => {
    expect(
      tokenSchema.safeParse({
        ...samples.token,
        position: { col: 1.5, row: 0.25 },
      }).success,
    ).toBe(true);
  });
});
