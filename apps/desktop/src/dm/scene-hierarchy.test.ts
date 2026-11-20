import { describe, expect, it } from "vitest";
import type { SceneEntry, SessionEntry } from "./campaign-data.js";
import { sceneHierarchy, scenePlaces, topScenes } from "./scene-hierarchy.js";

const scene = (id: string, parentSceneId?: string): SceneEntry => ({
  id,
  problem: null,
  scene: {
    schemaVersion: 2,
    id,
    name: id,
    map: null,
    tokens: [],
    fog: { levels: {} },
    initiative: null,
    ...(parentSceneId ? { parentSceneId } : {}),
  },
});

const session = (id: string, sceneIds: string[]): SessionEntry => ({
  id,
  problem: null,
  session: { schemaVersion: 2, id, name: id, sceneIds },
});

describe("scene hierarchy (T-152)", () => {
  const scenes = [
    scene("burg"),
    scene("keller", "burg"),
    scene("gang", "keller"),
    scene("turm", "burg"),
    scene("wald"),
  ];

  it("knows parents, children and all descendants at any depth", () => {
    const tree = sceneHierarchy(scenes);
    expect(tree.parentOf("gang")).toBe("keller");
    expect(tree.parentOf("burg")).toBeNull();
    expect(tree.childrenOf("burg")).toEqual(["keller", "turm"]);
    expect(tree.descendantsOf("burg")).toEqual(["keller", "gang", "turm"]);
    expect(tree.descendantsOf("wald")).toEqual([]);
  });

  it("makes scenes with a missing parent or in a loop top-level scenes", () => {
    const tree = sceneHierarchy([
      scene("a", "b"),
      scene("b", "a"),
      scene("c", "gone"),
      scene("d", "c"),
      scene("self", "self"),
      scene("below", "a"),
    ]);
    expect(tree.parentOf("a")).toBeNull();
    expect(tree.parentOf("b")).toBeNull();
    expect(tree.parentOf("c")).toBeNull();
    expect(tree.parentOf("d")).toBe("c");
    expect(tree.parentOf("self")).toBeNull();
    // Below a loop, not in it: it keeps its parent, which shows at the top.
    expect(tree.parentOf("below")).toBe("a");
    expect(tree.descendantsOf("a")).toEqual(["below"]);
  });

  it("nests a sub-scene under a listed grandparent when its parent is not listed", () => {
    const tree = sceneHierarchy(scenes);
    const sessions = [session("abend", ["gang", "burg"])];
    expect(topScenes(tree, scenes, sessions, { sessionId: "abend" })).toEqual([
      "burg",
    ]);
    expect(scenePlaces(tree, scenes, sessions, "gang")).toEqual([
      { sessionId: "abend" },
    ]);
  });

  it("shows sub-scenes under their parent wherever it shows", () => {
    const tree = sceneHierarchy(scenes);
    const sessions = [
      session("abend", ["burg", "gang"]),
      session("morgen", ["gang"]),
    ];
    // In "abend" the Gang is under the Burg; in "morgen" it is on its own at the top.
    expect(topScenes(tree, scenes, sessions, { sessionId: "abend" })).toEqual([
      "burg",
    ]);
    expect(topScenes(tree, scenes, sessions, { sessionId: "morgen" })).toEqual([
      "gang",
    ]);
    // Unsorted: only top-level scenes in no session.
    expect(topScenes(tree, scenes, sessions, "unsorted")).toEqual(["wald"]);
    expect(scenePlaces(tree, scenes, sessions, "gang")).toEqual([
      { sessionId: "abend" },
      { sessionId: "morgen" },
    ]);
    expect(scenePlaces(tree, scenes, sessions, "turm")).toEqual([
      { sessionId: "abend" },
    ]);
    expect(scenePlaces(tree, scenes, [], "turm")).toEqual(["unsorted"]);
  });
});
