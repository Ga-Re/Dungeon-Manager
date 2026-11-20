import type { Scene } from "@dungeon-manager/schema";
import { describe, expect, it } from "vitest";
import {
  NO_SCENE_TABS,
  closeSceneTabs,
  openSceneTab,
  replaceSceneTab,
  restoreSceneTabs,
  selectSceneTab,
  sendSceneTabToTv,
} from "./scene-tabs.js";

const scene = (id: string): Scene => ({
  schemaVersion: 3,
  id,
  name: id,
  map: null,
  tokens: [],
  fog: { levels: {} },
  initiative: null,
});
const ids = (state: { open: readonly Scene[] }) =>
  state.open.map((each) => each.id);

const three = [scene("a"), scene("b"), scene("c")].reduce(
  openSceneTab,
  NO_SCENE_TABS,
);

describe("scene tabs (T-223a)", () => {
  it("open as tabs; the first one goes on the dark TV, later ones do not", () => {
    expect(ids(three)).toEqual(["a", "b", "c"]);
    expect(three.active).toBe("c");
    expect(three.tv).toBe("a");
  });

  it("show an open scene again without a second tab or a TV change", () => {
    const dark = { ...three, tv: null };
    const again = openSceneTab(dark, { ...scene("a"), name: "older copy" });
    expect(ids(again)).toEqual(["a", "b", "c"]);
    expect(again.active).toBe("a");
    // Switching, even from the tree, never puts a scene on the TV.
    expect(again.tv).toBeNull();
    expect(again.open[0]?.name).toBe("a");
  });

  it("switch and send to the TV only open scenes", () => {
    expect(selectSceneTab(three, "b").active).toBe("b");
    expect(selectSceneTab(three, "x")).toBe(three);
    expect(sendSceneTabToTv(three, "b").tv).toBe("b");
    expect(sendSceneTabToTv(three, "x")).toBe(three);
  });

  it("close: the next tab shows; the TV goes dark when its scene goes", () => {
    const shownB = selectSceneTab(three, "b");
    const closed = closeSceneTabs(shownB, ["b"]);
    expect(ids(closed)).toEqual(["a", "c"]);
    expect(closed.active).toBe("c");
    expect(closed.tv).toBe("a");
    const last = closeSceneTabs(three, ["c"]);
    expect(last.active).toBe("b");
    const tvGone = closeSceneTabs(three, ["a"]);
    expect(tvGone.tv).toBeNull();
    expect(tvGone.active).toBe("c");
    expect(closeSceneTabs(three, ["a", "b", "c"])).toEqual(NO_SCENE_TABS);
  });

  it("close several at once (a scene and its sub-scenes), skipping closed neighbours", () => {
    const shownA = selectSceneTab(three, "a");
    const closed = closeSceneTabs(shownA, ["a", "b"]);
    expect(ids(closed)).toEqual(["c"]);
    expect(closed.active).toBe("c");
  });

  it("replace an open scene by its newer state", () => {
    const renamed = replaceSceneTab(three, { ...scene("b"), name: "Gruft" });
    expect(renamed.open[1]?.name).toBe("Gruft");
  });

  it("restore the remembered tabs that still exist (T-114a)", () => {
    const scenes = [scene("a"), scene("b"), scene("c")];
    const restored = restoreSceneTabs(NO_SCENE_TABS, scenes, {
      open: ["c", "gone", "a"],
      active: "a",
      tv: "c",
    });
    expect(ids(restored)).toEqual(["c", "a"]);
    expect(restored.active).toBe("a");
    expect(restored.tv).toBe("c");
    // A gone shown tab falls back to the last one; a gone TV scene leaves the TV dark.
    const fallback = restoreSceneTabs(NO_SCENE_TABS, scenes, {
      open: ["a", "b"],
      active: "gone",
      tv: "gone",
    });
    expect(fallback.active).toBe("b");
    expect(fallback.tv).toBeNull();
  });

  it("after a crash keep the TV dark, also for a scene opened later, until one is sent", () => {
    const scenes = [scene("a"), scene("b"), scene("c")];
    const restored = restoreSceneTabs(NO_SCENE_TABS, scenes, {
      open: ["a"],
      active: "a",
      tv: "a",
      afterCrash: true,
    });
    expect(restored.tv).toBeNull();
    const opened = openSceneTab(restored, scene("b"));
    expect(opened.tv).toBeNull();
    const sent = sendSceneTabToTv(opened, "b");
    expect(sent.tv).toBe("b");
    // Once the DM sent a scene, the old rule applies again after closing it.
    const closed = closeSceneTabs(sent, ["b"]);
    expect(openSceneTab(closed, scene("c")).tv).toBe("c");
  });

  it("merge into tabs the DM opened before the remembered ones came back", () => {
    const scenes = [scene("a"), scene("b"), scene("c")];
    const current = openSceneTab(NO_SCENE_TABS, scene("c"));
    const restored = restoreSceneTabs(current, scenes, {
      open: ["a", "c"],
      active: "a",
      tv: "a",
    });
    expect(ids(restored)).toEqual(["c", "a"]);
    expect(restored.active).toBe("c");
    expect(restored.tv).toBe("c");
  });
});
