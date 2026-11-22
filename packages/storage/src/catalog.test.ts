import { describe, expect, test } from "vitest";
import {
  createMemoryFileSystem,
  listLibraryMaps,
  previewFile,
} from "./index.js";

// The global map catalog (T-124, SPEC 8.2): every map in `library/maps`, for every campaign.

describe("listLibraryMaps", () => {
  test("lists images and videos in library/maps and its folders, sorted by path", async () => {
    const fs = createMemoryFileSystem({
      "library/maps/turm.png": "png",
      "library/maps/Höhlen/see.webm": "webm",
      "library/maps/Höhlen/gang.JPG": "jpg",
      "library/maps/liesmich.txt": "x",
      "library/maps/turm.png.dm.json": "{}",
      "library/maps/.versteckt.png": "png",
      "library/.previews/abc.webp": "webp",
      "library/tokens/ork.png": "png",
    });
    expect(await listLibraryMaps(fs)).toEqual([
      {
        path: "library/maps/Höhlen/gang.JPG",
        kind: "image",
        sidecarConflicts: [],
      },
      {
        path: "library/maps/Höhlen/see.webm",
        kind: "video",
        sidecarConflicts: [],
      },
      { path: "library/maps/turm.png", kind: "image", sidecarConflicts: [] },
    ]);
  });

  test("names a map's sidecar conflict copies with the map, never as maps", async () => {
    const fs = createMemoryFileSystem({
      "library/maps/turm.png": "png",
      "library/maps/turm.png.dm.json": "{}",
      "library/maps/turm.png.dm (conflicted copy 2026-11-20).json": "{}",
    });
    expect(await listLibraryMaps(fs)).toEqual([
      {
        path: "library/maps/turm.png",
        kind: "image",
        sidecarConflicts: ["turm.png.dm (conflicted copy 2026-11-20).json"],
      },
    ]);
  });

  test("an empty or missing maps folder lists nothing", async () => {
    expect(await listLibraryMaps(createMemoryFileSystem())).toEqual([]);
  });
});

describe("previewFile", () => {
  test("names a map's preview after its content hash", () => {
    expect(previewFile(`sha256:${"a".repeat(64)}`)).toBe(
      `library/.previews/${"a".repeat(64)}.jpg`,
    );
    expect(() => previewFile("sha256:nope")).toThrow();
  });
});
