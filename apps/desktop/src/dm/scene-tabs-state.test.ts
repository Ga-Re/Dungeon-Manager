import type { Scene } from "@dungeon-manager/schema";
import { describe, expect, it } from "vitest";
import {
  NO_SCENE_TABS,
  closeSceneTabs,
  openSceneTab,
  replaceSceneTab,
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
});
