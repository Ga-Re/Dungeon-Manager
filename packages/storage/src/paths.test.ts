import { describe, expect, test } from "vitest";
import { classifyLibraryPath, isValidSlug } from "./index.js";

describe("classifyLibraryPath", () => {
  test.each([
    ["campaigns/mine/campaign.json", { kind: "campaign", slug: "mine" }],
    [
      "campaigns/mine/scenes/scene-1.json",
      { kind: "scene", slug: "mine", sceneId: "scene-1" },
    ],
    [
      "campaigns/mine/scenes/scene-1 (1).json",
      { kind: "conflictCopy", slug: "mine", name: "scene-1 (1).json" },
    ],
    ["campaigns/mine/scenes/scene-1.json.tmp", { kind: "other" }],
    ["campaigns/mine/wiki/npc.md", { kind: "other" }],
    ["library/maps/cave.png", { kind: "asset", path: "library/maps/cave.png" }],
    ["../outside.json", { kind: "other" }],
  ] as const)("%s", (path, expected) => {
    expect(classifyLibraryPath(path)).toEqual(expected);
  });
});

test.each([
  ["die-verlorene-mine", true],
  ["a", true],
  ["Mine", false],
  ["../x", false],
  ["-start", false],
  ["", false],
])("isValidSlug(%j) is %s", (slug, valid) => {
  expect(isValidSlug(slug)).toBe(valid);
});
