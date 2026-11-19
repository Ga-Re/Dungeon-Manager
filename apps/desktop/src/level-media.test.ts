import { describe, expect, test } from "vitest";
import { levelMedia } from "./level-media.js";

const map = {
  kind: "video" as const,
  asset: { path: "library/maps/burg.webm" },
  levels: [
    { id: "hof" },
    { id: "keller", asset: { path: "library/maps/keller.png" } },
  ],
};

describe("levelMedia", () => {
  test("a level without its own file shows the map's", () => {
    expect(levelMedia(map, "hof")).toEqual({
      path: "library/maps/burg.webm",
      kind: "video",
    });
  });

  test("a level's own file has its own kind by file type", () => {
    expect(levelMedia(map, "keller")).toEqual({
      path: "library/maps/keller.png",
      kind: "image",
    });
  });

  test("nothing to show without any file (a companion's projection)", () => {
    expect(
      levelMedia({ kind: "image", levels: [{ id: "a" }] }, "a"),
    ).toBeNull();
  });
});
