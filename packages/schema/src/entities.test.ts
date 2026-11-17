import { describe, expect, test } from "vitest";
import type { ZodType } from "zod";
import * as samples from "./fixtures.test-data.js";
import {
  campaignSchema,
  combatantSchema,
  fogStateSchema,
  initiativeStateSchema,
  mapSchema,
  playerSchema,
  sceneSchema,
  tokenSchema,
  visibilityRuleSchema,
} from "./index.js";

/** Every entity with its schema and a valid sample. */
const entities: [string, ZodType, unknown][] = [
  ["Campaign", campaignSchema, samples.campaign],
  ["Scene", sceneSchema, samples.scene],
  ["Map", mapSchema, samples.map],
  ["Token", tokenSchema, samples.token],
  ["FogState", fogStateSchema, samples.fog],
  ["InitiativeState", initiativeStateSchema, samples.initiative],
  ["Combatant", combatantSchema, samples.combatant],
  ["VisibilityRule", visibilityRuleSchema, samples.visibilityRule],
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
    const withExtra = { ...(sample as object), addedLater: { nested: [1, 2] } };
    expect(roundTrip(schema, withExtra)).toEqual(withExtra);
  });
});

describe("unknown fields in nested objects", () => {
  test("are kept inside a scene's tokens and map", () => {
    const scene = {
      ...samples.scene,
      tokens: [{ ...samples.token, aura: "fire" }],
      map: { ...samples.map, grid: { ...samples.map.grid, style: "hex" } },
    };
    expect(roundTrip(sceneSchema, scene)).toEqual(scene);
  });
});

describe("validation", () => {
  test.each([
    [
      "a negative grid cell",
      tokenSchema,
      { ...samples.token, position: { col: -1, row: 0 } },
    ],
    [
      "a fractional grid cell",
      tokenSchema,
      { ...samples.token, position: { col: 1.5, row: 0 } },
    ],
    [
      "an unknown token size",
      tokenSchema,
      { ...samples.token, size: "colossal" },
    ],
    [
      "an unknown visibility",
      visibilityRuleSchema,
      { elementType: "hp", visibility: "maybe" },
    ],
    [
      "an absolute asset path",
      mapSchema,
      { ...samples.map, asset: { ...samples.map.asset, path: "/etc/passwd" } },
    ],
    [
      "an asset path leaving the library",
      mapSchema,
      {
        ...samples.map,
        asset: { ...samples.map.asset, path: "maps/../../x.png" },
      },
    ],
    [
      "a hash in the wrong format",
      mapSchema,
      { ...samples.map, asset: { ...samples.map.asset, hash: "md5:abc" } },
    ],
    [
      "a non-positive cell size",
      mapSchema,
      { ...samples.map, grid: { ...samples.map.grid, cellSizePx: 0 } },
    ],
    ["a map without levels", mapSchema, { ...samples.map, levels: [] }],
    [
      "temporary HP below zero",
      combatantSchema,
      { ...samples.combatant, hp: { current: 1, max: 1, temp: -1 } },
    ],
    [
      "a polygon with fewer than three points",
      fogStateSchema,
      {
        levels: {
          l: {
            revealed: [
              [
                [0, 0],
                [1, 1],
              ],
            ],
            remembered: [],
          },
        },
      },
    ],
    [
      "a scene with another schema version",
      sceneSchema,
      { ...samples.scene, schemaVersion: 2 },
    ],
    ["an empty id", playerSchema, { ...samples.player, id: "" }],
  ])("rejects %s", (_case, schema, value) => {
    expect(schema.safeParse(value).success).toBe(false);
  });
});
