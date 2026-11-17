import { describe, expect, test } from "vitest";
import { viewerSceneSchema, viewerTokenSchema } from "./index.js";

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
