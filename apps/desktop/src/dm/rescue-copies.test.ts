import type { Scene } from "@dungeon-manager/schema";
import { describe, expect, it } from "vitest";
import { memoryStorage } from "./memory-storage.test-data.js";
import {
  dropRescue,
  keepRescue,
  readRescues,
  type RescueCopy,
} from "./rescue-copies.js";

// Rescue copies (T-114b): a scene whose save failed, kept on this device until it is saved.

const scene = (id: string, name = id): Scene => ({
  schemaVersion: 3,
  id,
  name,
  map: null,
  tokens: [],
  fog: { levels: {} },
  initiative: null,
});
const copy = (sceneId: string, slug = "mine", root = "/lib"): RescueCopy => ({
  root,
  slug,
  scene: scene(sceneId),
  savedAt: "2026-11-20T12:00:00.000Z",
});

describe("rescue copies", () => {
  it("keep the latest failed state of each scene and survive a restart", () => {
    const storage = memoryStorage();
    keepRescue(storage, copy("a"));
    keepRescue(storage, { ...copy("a"), scene: scene("a", "newer") });
    keepRescue(storage, copy("b"));
    keepRescue(storage, copy("a", "other"));
    const kept = readRescues(storage);
    expect(kept.map((each) => [each.slug, each.scene.id])).toEqual([
      ["mine", "a"],
      ["mine", "b"],
      ["other", "a"],
    ]);
    expect(kept[0]?.scene.name).toBe("newer");
  });

  it("are dropped once the scene is saved, only in their campaign and library", () => {
    const storage = memoryStorage();
    keepRescue(storage, copy("a"));
    keepRescue(storage, copy("a", "mine", "/other"));
    dropRescue(storage, { root: "/lib", slug: "mine", sceneId: "a" });
    expect(readRescues(storage).map((each) => each.root)).toEqual(["/other"]);
    // Nothing kept: nothing to drop, and nothing written.
    const empty = memoryStorage();
    dropRescue(empty, { root: "/lib", slug: "mine", sceneId: "a" });
    expect(empty.getItem("dm.rescueCopies")).toBeNull();
  });

  it("skip what cannot be used: other versions, broken entries, invalid scenes", () => {
    const stored = (value: unknown) =>
      memoryStorage({ "dm.rescueCopies": JSON.stringify(value) });
    expect(readRescues(memoryStorage({ "dm.rescueCopies": "{" }))).toEqual([]);
    expect(readRescues(stored({ version: 2, copies: [copy("a")] }))).toEqual(
      [],
    );
    expect(
      readRescues(
        stored({
          version: 1,
          copies: [
            copy("a"),
            { ...copy("b"), scene: { id: "b" } },
            { ...copy("c"), root: 3 },
            "x",
          ],
        }),
      ).map((each) => each.scene.id),
    ).toEqual(["a"]);
    expect(readRescues(undefined)).toEqual([]);
  });

  it("are not kept when the storage refuses them", () => {
    const storage = memoryStorage();
    storage.setItem = () => {
      throw new Error("full");
    };
    expect(() => {
      keepRescue(storage, copy("a"));
    }).not.toThrow();
  });

  it("migrate a copy kept before an update, and keep entries they cannot read", () => {
    const old = { ...copy("a"), scene: { ...scene("a"), schemaVersion: 2 } };
    const unreadable = { ...copy("z"), scene: { id: "z", schemaVersion: 99 } };
    const storage = memoryStorage({
      "dm.rescueCopies": JSON.stringify({
        version: 1,
        copies: [old, unreadable],
      }),
    });
    expect(
      readRescues(storage).map((each) => each.scene.schemaVersion),
    ).toEqual([3]);
    keepRescue(storage, copy("b"));
    expect(
      dropRescue(storage, { root: "/lib", slug: "mine", sceneId: "a" }),
    ).toBe(true);
    expect(storage.getItem("dm.rescueCopies")).toContain('"schemaVersion":99');
    expect(
      dropRescue(storage, { root: "/lib", slug: "mine", sceneId: "a" }),
    ).toBe(false);
  });
});
