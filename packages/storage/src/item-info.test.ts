import { describe, expect, test } from "vitest";
import {
  createMemoryFileSystem,
  loadSidecar,
  MapDataChangedError,
  MapDataUnavailableError,
  updateItemInfo,
} from "./index.js";

// T-125 (DM decision, 2026-11-22): a catalog item's name and origin/license live in the `info`
// block of its sidecar, shared by every campaign.

const asset = {
  path: "library/maps/turm.png",
  hash: `sha256:${"a".repeat(64)}`,
};
const grid = { cellSizePx: 70, offsetXPx: 0, offsetYPx: 0 };

describe("updateItemInfo", () => {
  test("creates the sidecar of a map that has none", async () => {
    const fs = createMemoryFileSystem({ [asset.path]: "png" });
    expect(
      await updateItemInfo(fs, asset, { name: "Turm", license: "CC0" }),
    ).toEqual({ name: "Turm", license: "CC0" });
    const loaded = await loadSidecar(fs, asset.path);
    expect(loaded).toMatchObject({
      status: "ok",
      value: {
        original: { hash: asset.hash },
        info: { name: "Turm", license: "CC0" },
      },
    });
    expect(loaded.status === "ok" && loaded.value.map).toBeUndefined();
  });

  test("keeps the map's data and trims; empty fields are left out", async () => {
    const fs = createMemoryFileSystem({
      [asset.path]: "png",
      [`${asset.path}.dm.json`]: JSON.stringify({
        schemaVersion: 1,
        original: { hash: asset.hash },
        map: { grid, levels: [{ id: "ground", name: "Unten" }], rooms: [] },
        info: { name: "Alt", origin: "Pack" },
        future: "kept",
      }),
    });
    await updateItemInfo(fs, asset, {
      name: "  Turm ",
      origin: " ",
      license: "",
    });
    const loaded = await loadSidecar(fs, asset.path);
    expect(loaded).toMatchObject({
      status: "ok",
      value: {
        map: { grid },
        info: { name: "Turm" },
        future: "kept",
      },
    });
    expect(loaded.status === "ok" && loaded.value.info).toEqual({
      name: "Turm",
    });
  });

  test("never overwrites a sidecar it cannot read", async () => {
    const fs = createMemoryFileSystem({
      [asset.path]: "png",
      [`${asset.path}.dm.json`]: "{ broken",
    });
    await expect(
      updateItemInfo(fs, asset, { name: "Turm" }),
    ).rejects.toBeInstanceOf(MapDataUnavailableError);
    expect(fs.files().get(`${asset.path}.dm.json`)).toBe("{ broken");
  });

  test("refuses when the info changed since the DM began editing", async () => {
    const fs = createMemoryFileSystem({
      [asset.path]: "png",
      [`${asset.path}.dm.json`]: JSON.stringify({
        schemaVersion: 1,
        original: { hash: asset.hash },
        info: { name: "Von anderswo" },
      }),
    });
    await expect(
      updateItemInfo(fs, asset, { name: "Turm" }, { name: "Alt" }),
    ).rejects.toBeInstanceOf(MapDataChangedError);
    // What the DM saw is what is there: written.
    await updateItemInfo(fs, asset, { name: "Turm" }, { name: "Von anderswo" });
    const loaded = await loadSidecar(fs, asset.path);
    expect(loaded.status === "ok" && loaded.value.info).toEqual({
      name: "Turm",
    });
  });
});
