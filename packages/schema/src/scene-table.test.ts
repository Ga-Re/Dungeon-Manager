import { describe, expect, it } from "vitest";
import { sceneSchema } from "./documents.js";

const scene = {
  schemaVersion: 2,
  id: "krypta",
  name: "Krypta",
  map: null,
  tokens: [],
  fog: { levels: {} },
  initiative: null,
};

describe("the TV's level in a scene (T-118a)", () => {
  it("is optional, so older scene files stay valid", () => {
    expect(sceneSchema.parse(scene).table).toBeUndefined();
  });

  it("keeps the current and the released levels", () => {
    const table = {
      levelId: "keller",
      shownLevelIds: ["erdgeschoss", "keller"],
    };
    expect(sceneSchema.parse({ ...scene, table }).table).toEqual(table);
  });

  it("rejects level ids that are not ids", () => {
    expect(
      sceneSchema.safeParse({
        ...scene,
        table: { levelId: "../keller", shownLevelIds: [] },
      }).success,
    ).toBe(false);
  });
});
