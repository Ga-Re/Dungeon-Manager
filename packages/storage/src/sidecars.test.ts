import type { Scene, Sidecar } from "@dungeon-manager/schema";
import { describe, expect, test } from "vitest";
import {
  adoptLegacyMap,
  classifyLibraryPath,
  createMemoryFileSystem,
  listSidecarConflicts,
  loadSidecar,
  saveSidecar,
  settleLegacyMap,
  sidecarFile,
} from "./index.js";

// Sidecar files next to library files (ADR-0012, T-134c).

const hash = `sha256:${"e".repeat(64)}`;
const other = `sha256:${"f".repeat(64)}`;
const grid = { cellSizePx: 70, offsetXPx: 0, offsetYPx: 0 };
const sidecar: Sidecar = {
  schemaVersion: 1,
  original: { hash },
  map: {
    grid,
    levels: [{ id: "ground", name: "Erdgeschoss" }],
    rooms: [],
  },
};

describe("sidecar files", () => {
  test("live next to their file as <file>.dm.json", () => {
    expect(sidecarFile("library/maps/turm.png")).toBe(
      "library/maps/turm.png.dm.json",
    );
  });

  test("only library files have one", () => {
    for (const path of [
      "campaigns/mine/campaign.json",
      "library/../campaigns/x.png",
      "library/maps/turm.png.dm.json",
      "library/.previews/turm.webp",
      "library/maps/.hidden.png",
      "library/maps\\..\\x.png",
      "library",
    ])
      expect(() => sidecarFile(path)).toThrow();
  });

  test("round-trip as pretty JSON", async () => {
    const fs = createMemoryFileSystem();
    await saveSidecar(fs, "library/maps/turm.png", sidecar);
    expect(fs.files().get("library/maps/turm.png.dm.json")).toBe(
      `${JSON.stringify(sidecar, null, 2)}\n`,
    );
    expect(await loadSidecar(fs, "library/maps/turm.png")).toEqual({
      status: "ok",
      value: sidecar,
    });
  });

  test("a missing sidecar is reported as missing, so the caller uses defaults", async () => {
    expect(
      await loadSidecar(createMemoryFileSystem(), "library/maps/turm.png"),
    ).toEqual({ status: "missing" });
  });

  test("a sidecar not downloaded yet or broken is reported, not thrown", async () => {
    const fs = createMemoryFileSystem({
      "library/maps/a.png.dm.json": { placeholder: true },
      "library/maps/b.png.dm.json": "{",
    });
    expect(await loadSidecar(fs, "library/maps/a.png")).toEqual({
      status: "notAvailable",
    });
    expect(await loadSidecar(fs, "library/maps/b.png")).toEqual({
      status: "invalid",
      reason: "json",
    });
    expect(await loadSidecar(fs, "../x.png")).toEqual({
      status: "invalid",
      reason: "path",
    });
  });

  test("an invalid sidecar is never written", async () => {
    const fs = createMemoryFileSystem();
    await expect(
      saveSidecar(fs, "library/maps/turm.png", {
        ...sidecar,
        original: { hash: "md5:1" },
      }),
    ).rejects.toThrow();
    expect(fs.files().size).toBe(0);
  });

  test("conflict copies of sidecars are found next to them", async () => {
    const fs = createMemoryFileSystem({
      "library/maps/turm.png": "png",
      "library/maps/turm.png.dm.json": "{}",
      "library/maps/turm.png.dm (conflicted copy 2026-11-20).json": "{}",
      "library/maps/notes (1).json": "{}",
      "library/maps/keller.png.dm.json": "{}",
      "library/maps/keller.png.dm.sync-conflict-20261120-101500-ABCDEFG.json":
        "{}",
    });
    expect(await listSidecarConflicts(fs, "library/maps")).toEqual([
      {
        copy: "turm.png.dm (conflicted copy 2026-11-20).json",
        original: "turm.png.dm.json",
        provider: "Dropbox",
      },
      {
        copy: "keller.png.dm.sync-conflict-20261120-101500-ABCDEFG.json",
        original: "keller.png.dm.json",
        provider: "Syncthing",
      },
    ]);
    expect(await listSidecarConflicts(fs, "library/none")).toEqual([]);
  });

  test("the watcher tells sidecars from the files they describe", () => {
    expect(classifyLibraryPath("library/maps/turm.png.dm.json")).toEqual({
      kind: "sidecarFile",
      directory: "library/maps",
      name: "turm.png.dm.json",
    });
    expect(
      classifyLibraryPath("library/maps/turm.png.dm (1).json"),
    ).toMatchObject({ kind: "sidecarFile", name: "turm.png.dm (1).json" });
    expect(classifyLibraryPath("library/packs/notes.json")).toEqual({
      kind: "other",
    });
    expect(classifyLibraryPath("library/maps/turm.png")).toEqual({
      kind: "asset",
      path: "library/maps/turm.png",
    });
  });
});

describe("adopting a version 2 scene's map (ADR-0012 migration)", () => {
  const legacy = {
    grid,
    levels: [{ id: "ground", name: "Erdgeschoss" }],
  };

  test("seeds a missing sidecar from the scene's grid and levels", () => {
    expect(adoptLegacyMap(null, legacy, hash)).toEqual({
      kind: "seed",
      sidecar,
    });
  });

  test("adds map data to a sidecar that has none yet", () => {
    const bare: Sidecar = { schemaVersion: 1, original: { hash }, tags: ["x"] };
    expect(adoptLegacyMap(bare, legacy, hash)).toEqual({
      kind: "seed",
      sidecar: { ...sidecar, tags: ["x"] },
    });
  });

  test("a sidecar holding exactly the scene's grid and levels fits", () => {
    expect(adoptLegacyMap(sidecar, legacy, hash)).toEqual({ kind: "fits" });
  });

  test("other level names, added, reordered or archived levels differ: nothing is lost silently", () => {
    const base = sidecar.map;
    if (!base) throw new Error("the sample sidecar has a map");
    const twoLevels = {
      grid,
      levels: [
        { id: "ground", name: "Erdgeschoss" },
        { id: "attic", name: "Dach" },
      ],
    };
    for (const levels of [
      [{ id: "ground", name: "Taverne" }],
      [...legacy.levels, { id: "attic", name: "Dach" }],
      [{ id: "ground", name: "Erdgeschoss", archived: true }],
    ])
      expect(
        adoptLegacyMap({ ...sidecar, map: { ...base, levels } }, legacy, hash),
      ).toEqual({ kind: "differs" });
    expect(
      adoptLegacyMap(
        {
          ...sidecar,
          map: { ...base, levels: [...twoLevels.levels].reverse() },
        },
        twoLevels,
        hash,
      ),
    ).toEqual({ kind: "differs" });
  });

  test("another grid, a missing level or another level image differs: the DM decides", () => {
    const withMap = (map: NonNullable<Sidecar["map"]>): Sidecar => ({
      ...sidecar,
      map,
    });
    const base = sidecar.map;
    if (!base) throw new Error("the sample sidecar has a map");
    expect(
      adoptLegacyMap(
        withMap({ ...base, grid: { ...grid, cellSizePx: 100 } }),
        legacy,
        hash,
      ),
    ).toEqual({ kind: "differs" });
    expect(
      adoptLegacyMap(
        withMap({ ...base, levels: [{ id: "cellar", name: "Keller" }] }),
        legacy,
        hash,
      ),
    ).toEqual({ kind: "differs" });
    expect(
      adoptLegacyMap(
        withMap(base),
        {
          grid,
          levels: [
            {
              id: "ground",
              name: "Erdgeschoss",
              asset: { path: "library/maps/eg.png", hash: other },
            },
          ],
        },
        hash,
      ),
    ).toEqual({ kind: "differs" });
  });
});

describe("settling a scene's legacy map when it opens (T-134d)", () => {
  const asset = { path: "library/maps/turm.png", hash };
  const legacyScene: Scene = {
    schemaVersion: 3,
    id: "turm",
    name: "Turm",
    map: {
      kind: "image",
      asset,
      overrides: {},
      legacyMap: { grid, levels: [{ id: "ground", name: "Erdgeschoss" }] },
    },
    tokens: [],
    fog: { levels: {} },
    initiative: null,
  };
  const reference = { kind: "image", asset, overrides: {} };

  test("the first scene of a map seeds its sidecar and drops its copy", async () => {
    const fs = createMemoryFileSystem();
    const settled = await settleLegacyMap(fs, legacyScene);
    expect(settled.map).toEqual(reference);
    expect(await loadSidecar(fs, asset.path)).toEqual({
      status: "ok",
      value: sidecar,
    });
  });

  test("a scene that fits the sidecar drops its copy; one that differs keeps it", async () => {
    const fs = createMemoryFileSystem();
    await saveSidecar(fs, asset.path, sidecar);
    expect((await settleLegacyMap(fs, legacyScene)).map).toEqual(reference);
    const renamed: Scene = {
      ...legacyScene,
      map: {
        ...reference,
        kind: "image",
        legacyMap: { grid, levels: [{ id: "ground", name: "Taverne" }] },
      },
    };
    expect(await settleLegacyMap(fs, renamed)).toBe(renamed);
    expect(await loadSidecar(fs, asset.path)).toMatchObject({
      value: sidecar,
    });
  });

  test("a sidecar not downloaded yet is never seeded over", async () => {
    const fs = createMemoryFileSystem({
      "library/maps/turm.png.dm.json": { placeholder: true },
    });
    expect(await settleLegacyMap(fs, legacyScene)).toBe(legacyScene);
    expect(fs.files().has("library/maps/turm.png.dm.json")).toBe(false);
  });

  test("scenes without a legacy map are left as they are", async () => {
    const plain: Scene = { ...legacyScene, map: null };
    expect(await settleLegacyMap(createMemoryFileSystem(), plain)).toBe(plain);
  });
});
