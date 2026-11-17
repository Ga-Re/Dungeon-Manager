import { describe, expect, test } from "vitest";
import { classifyLibraryPath, isValidSlug } from "./index.js";

describe("classifyLibraryPath", () => {
  test.each([
    ["campaigns/mine/campaign.json", { kind: "campaign", slug: "mine" }],
    // Scene or conflict copy can only be told apart with the folder (and, for OneDrive, the
    // content) at hand, so the watcher re-lists the folder via `listScenes`.
    [
      "campaigns/mine/scenes/scene-1.json",
      { kind: "sceneFile", slug: "mine", name: "scene-1.json" },
    ],
    [
      "campaigns/mine/scenes/scene-1-DESKTOP-4F2KQ1.json",
      { kind: "sceneFile", slug: "mine", name: "scene-1-DESKTOP-4F2KQ1.json" },
    ],
    [
      "campaigns/mine/scenes/scene-1 (1).json",
      { kind: "sceneFile", slug: "mine", name: "scene-1 (1).json" },
    ],
    ["campaigns/mine/scenes/notes.txt", { kind: "other" }],
    ["campaigns/mine/scenes/scene-1.json.tmp", { kind: "other" }],
    ["campaigns/mine/wiki/npc.md", { kind: "other" }],
    ["library/maps/cave.png", { kind: "asset", path: "library/maps/cave.png" }],
    ["library/maps/cave.png.tmp", { kind: "other" }],
    ["library/.previews/cave.webp", { kind: "other" }],
    ["library/..\\outside.png", { kind: "other" }],
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
  // Reserved device names on Windows.
  ["con", false],
  ["com1", false],
])("isValidSlug(%j) is %s", (slug, valid) => {
  expect(isValidSlug(slug)).toBe(valid);
});
