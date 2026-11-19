import type { ViewerScene } from "@dungeon-manager/schema";
import { describe, expect, test } from "vitest";
import { PLAYER_VIEW_VERSION, parsePlayerViewMessage } from "./index.js";

const scene: ViewerScene = {
  id: "s-1",
  name: "Höhle",
  map: {
    kind: "image",
    asset: {
      path: "library/maps/hoehle.png",
      hash: `sha256:${"a".repeat(64)}`,
    },
    currentLevelId: "ground",
    grid: { cellSizePx: 100, offsetXPx: 0, offsetYPx: 0 },
    levels: [{ id: "ground", name: "Erdgeschoss" }],
  },
  fog: {},
  tokens: [],
};

describe("parsePlayerViewMessage", () => {
  test("accepts a projected scene, or none, with a rotation", () => {
    const message = { v: PLAYER_VIEW_VERSION, scene, rotation: 90 };
    expect(parsePlayerViewMessage(message)).toEqual(message);
    expect(parsePlayerViewMessage({ v: 1, scene: null, rotation: 0 })).toEqual({
      v: 1,
      scene: null,
      rotation: 0,
    });
  });

  test.each([
    ["another version", { v: 2, scene: null, rotation: 0 }],
    ["an odd rotation", { v: 1, scene: null, rotation: 45 }],
    [
      "unprojected data (unknown fields)",
      {
        v: 1,
        scene: { ...scene, notes: "Der Wirt ist der Mörder" },
        rotation: 0,
      },
    ],
    ["extra message fields", { v: 1, scene: null, rotation: 0, secret: true }],
    ["no object", "hello"],
  ])("rejects %s", (_, raw) => {
    expect(parsePlayerViewMessage(raw)).toBeNull();
  });
});
