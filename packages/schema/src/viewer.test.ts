import { describe, expect, test } from "vitest";
import {
  viewerEventSchema,
  viewerSceneSchema,
  viewerTokenSchema,
} from "./index.js";

const token = {
  id: "t1",
  size: "medium",
  position: { col: 1, row: 2 },
  levelId: "ground",
};

describe("viewer schemas are strict", () => {
  test("accept a minimal projected scene", () => {
    expect(
      viewerSceneSchema.safeParse({
        id: "s1",
        name: "Höhle",
        map: null,
        fog: {},
        tokens: [token],
      }).success,
    ).toBe(true);
  });

  test.each([
    ["an unknown token field", { ...token, visibility: { token: "hidden" } }],
    [
      "an unknown field in the position",
      { ...token, position: { col: 1, row: 2, secret: true } },
    ],
  ])("reject %s, so hidden data cannot slip through", (_case, value) => {
    expect(viewerTokenSchema.safeParse(value).success).toBe(false);
  });

  test("reject unknown fields on the scene", () => {
    expect(
      viewerSceneSchema.safeParse({
        id: "s1",
        name: "x",
        map: null,
        fog: {},
        tokens: [],
        dmNotes: "trap",
      }).success,
    ).toBe(false);
  });
});

describe("viewer events", () => {
  const hpChanged = { at: 1, type: "hp.changed", combatantId: "goblin" };
  const hp = { current: 4, temp: 0 };

  test("carry exact HP or the coarse state, never both and never neither", () => {
    expect(viewerEventSchema.safeParse({ ...hpChanged, hp }).success).toBe(
      true,
    );
    expect(
      viewerEventSchema.safeParse({ ...hpChanged, hpState: "wounded" }).success,
    ).toBe(true);
    expect(
      viewerEventSchema.safeParse({ ...hpChanged, hp, hpState: "wounded" })
        .success,
    ).toBe(false);
    expect(viewerEventSchema.safeParse(hpChanged).success).toBe(false);
  });

  test("reject unknown keys and DM-only events", () => {
    expect(
      viewerEventSchema.safeParse({
        at: 1,
        type: "token.moved",
        tokenId: "t1",
        to: { col: 1, row: 1 },
        from: { col: 0, row: 0 },
        levelId: "ground",
      }).success,
    ).toBe(false);
    expect(
      viewerEventSchema.safeParse({
        at: 1,
        type: "initiative.combatantRemoved",
        combatantId: "goblin",
      }).success,
    ).toBe(false);
  });
});
