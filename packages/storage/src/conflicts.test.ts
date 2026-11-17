import { describe, expect, test } from "vitest";
import { findConflictCopies } from "./index.js";

// Naming patterns as produced by the sync clients (self-written examples, no real user data).
describe("findConflictCopies", () => {
  test.each([
    ["Dropbox", "scene-1 (conflicted copy 2026-11-17).json"],
    ["Dropbox", "scene-1 (Gabi's conflicted copy 2026-11-17).json"],
    [
      "Dropbox",
      "scene-1 (in Konflikt stehende Kopie von MacBook 2026-11-17).json",
    ],
    ["OneDrive", "scene-1-DESKTOP-4F2KQ1.json"],
    ["OneDrive", "scene-1-MacBook-Air.json"],
    ["Google Drive", "scene-1 (1).json"],
    ["iCloud", "scene-1 2.json"],
    ["Syncthing", "scene-1.sync-conflict-20261117-101500-ABCDEFG.json"],
  ] as const)("detects a %s conflict copy: %s", (provider, copy) => {
    expect(findConflictCopies(["scene-1.json", copy])).toEqual([
      { copy, original: "scene-1.json", provider },
    ]);
  });

  test("reports copies whose original is gone, if the pattern is unambiguous", () => {
    expect(
      findConflictCopies(["campaign (conflicted copy 2026-11-17).json"]),
    ).toEqual([
      {
        copy: "campaign (conflicted copy 2026-11-17).json",
        original: "campaign.json",
        provider: "Dropbox",
      },
    ]);
  });

  test.each([
    "scene-2.json",
    "scene-1.json.tmp",
    "goblin-camp.json",
    // Ambiguous suffixes only count when the original sits next to them.
    "monster-ABCD.json",
    "level 2.json",
    "map (1).json",
  ])("does not flag %s", (name) => {
    expect(findConflictCopies(["scene-1.json", name])).toEqual([]);
  });
});
