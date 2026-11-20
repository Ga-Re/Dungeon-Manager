import type { Creature, Token } from "@dungeon-manager/schema";
import { describe, expect, test } from "vitest";
import { resolveTokenCreature } from "./token-creature.js";

// A token's creature (T-180a, ADR-0018): looked up by its reference; a missing one leaves the
// token as it is, marked for a placeholder.

const art = (name: string) => ({
  path: `library/tokens/${name}.webp`,
  hash: `sha256:${"a".repeat(64)}`,
});
const creature = (id: string, change: Partial<Creature> = {}): Creature => ({
  schemaVersion: 1,
  id,
  name: id,
  size: "large",
  look: { style: "round", token: art(id) },
  ...change,
});
const token: Token = {
  id: "t1",
  name: "Oger 1",
  size: "large",
  position: { col: 0, row: 0 },
  levelId: "ground",
  creature: { source: "library", id: "oger" },
};
const library = new Map([
  ["library:oger", creature("oger")],
  ["library:wagen", creature("wagen", { footprint: { cols: 2, rows: 4 } })],
  ["library:wolf", creature("wolf", { size: "medium" })],
]);
const find = (ref: { source: string; id: string }) =>
  library.get(`${ref.source}:${ref.id}`);

describe("a token's creature", () => {
  test("gives the token its picture and footprint", () => {
    const resolved = resolveTokenCreature(token, find);
    expect(resolved.creature?.id).toBe("oger");
    expect(resolved.missingCreature).toBe(false);
    expect(resolved.image).toEqual(art("oger"));
    expect(resolved.footprint).toEqual({ cols: 2, rows: 2, share: 1 });
    const wagon = resolveTokenCreature(
      { ...token, creature: { source: "library", id: "wagen" } },
      find,
    );
    expect(wagon.footprint).toEqual({ cols: 2, rows: 4, share: 1 });
  });

  test("the token's own picture and a different size win", () => {
    const own = resolveTokenCreature(
      { ...token, image: art("eigen"), size: "huge" },
      find,
    );
    expect(own.image).toEqual(art("eigen"));
    expect(own.footprint).toEqual({ cols: 3, rows: 3, share: 1 });
  });

  test("an active shape takes the creature's place", () => {
    const shaped = resolveTokenCreature(
      { ...token, size: "medium", shape: { source: "library", id: "wolf" } },
      find,
    );
    expect(shaped.creature?.id).toBe("wolf");
    expect(shaped.image).toEqual(art("wolf"));
  });

  test("a missing creature keeps the token as it is, for a placeholder", () => {
    const missing = resolveTokenCreature(
      { ...token, creature: { source: "library", id: "weg" } },
      find,
    );
    expect(missing).toEqual({
      creature: null,
      missingCreature: true,
      image: null,
      footprint: { cols: 2, rows: 2, share: 1 },
    });
    // A token without a creature is not missing one.
    const plain = resolveTokenCreature(
      {
        id: "t2",
        name: "Mini",
        size: "tiny",
        position: { col: 0, row: 0 },
        levelId: "ground",
      },
      find,
    );
    expect(plain.missingCreature).toBe(false);
    expect(plain.footprint.share).toBe(0.25);
  });
});
