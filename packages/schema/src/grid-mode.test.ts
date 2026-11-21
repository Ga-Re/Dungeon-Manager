import { describe, expect, it } from "vitest";
import { campaignSchema, sceneSchema } from "./documents.js";

// Grid mode and combat (T-233): optional and additive, so older files stay valid.

const scene = {
  schemaVersion: 3,
  id: "krypta",
  name: "Krypta",
  map: null,
  tokens: [],
  fog: { levels: {} },
  initiative: null,
};
const campaign = {
  schemaVersion: 2,
  id: "fluch",
  name: "Fluch",
  players: [],
  visibilityDefaults: {},
};

describe("grid mode and combat (T-233)", () => {
  it("are optional in scenes and campaigns", () => {
    const parsed = sceneSchema.parse(scene);
    expect(parsed.gridMode).toBeUndefined();
    expect(parsed.combat).toBeUndefined();
    expect(campaignSchema.parse(campaign).gridMode).toBeUndefined();
  });

  it("keep a scene's mode, its combat and the campaign's default", () => {
    expect(
      sceneSchema.parse({ ...scene, gridMode: "free", combat: true }),
    ).toMatchObject({ gridMode: "free", combat: true });
    expect(
      campaignSchema.parse({ ...campaign, gridMode: "grid" }).gridMode,
    ).toBe("grid");
  });

  it("reject an unknown mode", () => {
    expect(sceneSchema.safeParse({ ...scene, gridMode: "hex" }).success).toBe(
      false,
    );
  });
});

describe("initiative markers on a combatant (T-111)", () => {
  it("are optional, so older scene files stay valid, and are kept", () => {
    const combatant = {
      id: "goblin",
      name: "Goblin",
      initiative: 14,
      conditions: [],
    };
    const initiative = {
      round: 1,
      activeCombatantId: "goblin",
      order: ["goblin"],
      combatants: [combatant],
    };
    expect(sceneSchema.parse({ ...scene, initiative }).initiative).toEqual(
      initiative,
    );
    const marked = {
      ...combatant,
      initiativeBonus: 2,
      playerId: "p1",
      delayed: true,
      ready: true,
    };
    expect(
      sceneSchema.parse({
        ...scene,
        initiative: { ...initiative, combatants: [marked] },
      }).initiative?.combatants[0],
    ).toEqual(marked);
  });
});
