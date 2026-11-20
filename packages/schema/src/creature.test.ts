import { describe, expect, it } from "vitest";
import {
  creatureDocument,
  creatureSchema,
  migrateDocument,
  tokenSchema,
  type Creature,
} from "./index.js";

// Creature files (T-180a, ADR-0018).

const ghoul: Creature = {
  schemaVersion: 1,
  id: "ghul",
  name: "Ghul",
  type: "Untoter",
  challenge: "1",
  size: "medium",
  hp: { value: 22, formula: "5d8" },
  ac: 12,
  initiativeModifier: 2,
  speeds: { walk: 30 },
  senses: { darkvision: 60 },
  look: {
    style: "round",
    token: {
      path: "library/tokens/ghul.webp",
      hash: `sha256:${"a".repeat(64)}`,
    },
    faction: "#8a1c1c",
  },
  fields: [
    { name: "Herkunft", value: "Krypta" },
    { name: "Stufe", value: 3 },
  ],
  statBlock: "**Klauen.** +4 zum Treffen",
};

describe("creature files", () => {
  it("accept a creature with the 5e core, look and own fields", () => {
    expect(creatureSchema.parse(ghoul)).toEqual(ghoul);
    expect(migrateDocument(ghoul, creatureDocument)).toEqual(ghoul);
  });

  it("need only id, name, size and how it looks", () => {
    const minimal = {
      schemaVersion: 1,
      id: "fass",
      name: "Fass",
      size: "small",
      look: { style: "cutout" },
    };
    expect(creatureSchema.safeParse(minimal).success).toBe(true);
  });

  it("allow a footprint of its own and a pivot (a wagon)", () => {
    const wagon = {
      ...ghoul,
      id: "wagen",
      size: "large",
      footprint: { cols: 2, rows: 4 },
      pivot: { x: 1, y: 3 },
    };
    expect(creatureSchema.safeParse(wagon).success).toBe(true);
    expect(
      creatureSchema.safeParse({ ...wagon, footprint: { cols: 0, rows: 4 } })
        .success,
    ).toBe(false);
  });

  it("refuse what the app cannot use", () => {
    const bad = (change: object) =>
      creatureSchema.safeParse({ ...ghoul, ...change }).success;
    expect(bad({ id: "Ghul" })).toBe(false);
    expect(bad({ size: "colossal" })).toBe(false);
    expect(bad({ senses: { darkvision: -5 } })).toBe(false);
    expect(bad({ speeds: { fly: 12.5 } })).toBe(false);
    expect(bad({ look: { style: "square" } })).toBe(false);
    expect(bad({ look: { style: "round", faction: "red" } })).toBe(false);
    expect(bad({ fields: [{ name: "", value: 1 }] })).toBe(false);
  });

  it("keep fields a newer app adds", () => {
    const newer = { ...ghoul, aura: { radius: 10 } };
    expect(creatureSchema.parse(newer)).toHaveProperty("aura");
  });

  it("are refused when newer than this app", () => {
    expect(() =>
      migrateDocument({ ...ghoul, schemaVersion: 2 }, creatureDocument),
    ).toThrow();
  });
});

describe("tokens refer to their creature (T-180a)", () => {
  const token = {
    id: "ghul-1",
    name: "Ghul 1",
    size: "medium",
    position: { col: 2, row: 3 },
    levelId: "ground",
  };

  it("by place and id, optionally with an active shape", () => {
    const placed = {
      ...token,
      creature: { source: "library", id: "ghul" },
      shape: { source: "library", id: "wolf" },
    };
    expect(tokenSchema.parse(placed)).toEqual(placed);
    expect(
      tokenSchema.safeParse({ ...token, creature: { source: "web", id: "x" } })
        .success,
    ).toBe(false);
  });

  it("and tokens without a creature stay valid (no migration)", () => {
    expect(tokenSchema.safeParse(token).success).toBe(true);
  });
});
