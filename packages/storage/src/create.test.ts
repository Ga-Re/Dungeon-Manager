import { sceneSchema, type Scene } from "@dungeon-manager/schema";
import { describe, expect, test } from "vitest";
import {
  createCampaign,
  createMemoryFileSystem,
  createScene,
  deleteScene,
  reparentScene,
  listScenes,
  DEFAULT_LEVEL_ID,
  loadSidecar,
  MapDataUnavailableError,
  mapDataForChange,
  mapKind,
  saveSidecar,
  withMap,
  isValidSlug,
  loadCampaign,
  loadScene,
  slugify,
} from "./index.js";

describe("slugify", () => {
  test.each([
    ["Die verlorene Mine", "die-verlorene-mine"],
    ["Fluch über Größenwahn!", "fluch-ueber-groessenwahn"],
    ["  ---Curse of  Strahd--- ", "curse-of-strahd"],
    ["Été à Paris", "ete-a-paris"],
    ["Fu\u0308hrer der Zwerge", "fuehrer-der-zwerge"],
    ["nul", "nul-campaign"],
    ["???", "campaign"],
  ])("%j → %j", (name, slug) => {
    expect(slugify(name)).toBe(slug);
    expect(isValidSlug(slugify(name))).toBe(true);
  });

  test("stays within 64 characters without a trailing dash", () => {
    const slug = slugify(`${"a".repeat(63)} b`);
    expect(slug).toBe("a".repeat(63));
  });
});

describe("createCampaign", () => {
  test("writes campaign.json into a new folder named after the campaign", async () => {
    const fs = createMemoryFileSystem();
    const slug = await createCampaign(fs, {
      id: "c-1",
      name: "Die verlorene Mine",
    });
    expect(slug).toBe("die-verlorene-mine");
    expect(await loadCampaign(fs, slug)).toEqual({
      status: "ok",
      value: {
        schemaVersion: 2,
        id: "c-1",
        name: "Die verlorene Mine",
        players: [],
        visibilityDefaults: {},
      },
    });
  });

  test("never reuses an existing folder", async () => {
    const fs = createMemoryFileSystem({
      "campaigns/mine/campaign.json": "{}",
      "campaigns/mine-2/notes.md": "x",
    });
    expect(await createCampaign(fs, { id: "c-2", name: "Mine" })).toBe(
      "mine-3",
    );
  });

  test("treats folders differing only in case as taken", async () => {
    const fs = createMemoryFileSystem({
      "campaigns/Mine/campaign.json": "hand-made",
    });
    expect(await createCampaign(fs, { id: "c-3", name: "Mine" })).toBe(
      "mine-2",
    );
    expect(fs.files().get("campaigns/Mine/campaign.json")).toBe("hand-made");
  });

  test("rejects an empty name and writes nothing", async () => {
    const fs = createMemoryFileSystem();
    await expect(
      createCampaign(fs, { id: "c-1", name: "  " }),
    ).rejects.toThrow();
    expect(fs.files().size).toBe(0);
  });
});

describe("createScene", () => {
  test("saves an empty scene and returns it", async () => {
    const fs = createMemoryFileSystem();
    const scene = await createScene(fs, "mine", {
      id: "s-1",
      name: " Eingang ",
    });
    expect(scene).toEqual({
      schemaVersion: 3,
      id: "s-1",
      name: "Eingang",
      map: null,
      tokens: [],
      fog: { levels: {} },
      initiative: null,
    });
    expect(await loadScene(fs, "mine", "s-1")).toEqual({
      status: "ok",
      value: scene,
    });
  });

  test("can start with a map, which is validated; a map without data gets its sidecar", async () => {
    const fs = createMemoryFileSystem();
    const asset = {
      path: "library/maps/cave.webp",
      hash: `sha256:${"a".repeat(64)}`,
    };
    const scene = await createScene(fs, "mine", {
      id: "s-2",
      name: "Höhle",
      map: { asset, levelName: "Erdgeschoss" },
    });
    expect(scene.map).toEqual({ kind: "image", asset, overrides: {} });
    expect(await loadSidecar(fs, asset.path)).toEqual({
      status: "ok",
      value: {
        schemaVersion: 1,
        original: { hash: asset.hash },
        map: {
          grid: { cellSizePx: 100, offsetXPx: 0, offsetYPx: 0 },
          // The id the DM window plays a map without data with, so its fog still fits.
          levels: [{ id: DEFAULT_LEVEL_ID, name: "Erdgeschoss" }],
          rooms: [],
        },
      },
    });
    await expect(
      createScene(fs, "mine", {
        id: "s-3",
        name: "Kaputt",
        map: {
          asset: { path: "../x.webp", hash: "nope" },
          levelName: "Erdgeschoss",
        },
      }),
    ).rejects.toThrow();
    expect(fs.files().has("campaigns/mine/scenes/s-3.json")).toBe(false);
  });

  test("a map that already has data keeps it: it is calibrated once for every scene", async () => {
    const asset = {
      path: "library/maps/cave.webp",
      hash: `sha256:${"a".repeat(64)}`,
    };
    const calibrated = {
      grid: { cellSizePx: 70, offsetXPx: 5, offsetYPx: 0 },
      levels: [{ id: "ground", name: "Höhle" }],
      rooms: [],
    };
    const fs = createMemoryFileSystem();
    await saveSidecar(fs, asset.path, {
      schemaVersion: 1,
      original: { hash: asset.hash },
      map: calibrated,
    });
    await createScene(fs, "mine", {
      id: "s-2",
      name: "Höhle 2",
      map: { asset, levelName: "Neu" },
    });
    expect(await loadSidecar(fs, asset.path)).toMatchObject({
      value: { map: calibrated },
    });
  });

  test("a map whose sidecar is not downloaded yet gets no scene, and its sidecar stays", async () => {
    const fs = createMemoryFileSystem({
      "library/maps/cave.webp.dm.json": { placeholder: true },
    });
    await expect(
      createScene(fs, "mine", {
        id: "s-2",
        name: "Höhle",
        map: {
          asset: {
            path: "library/maps/cave.webp",
            hash: `sha256:${"a".repeat(64)}`,
          },
          levelName: "L",
        },
      }),
    ).rejects.toThrow(MapDataUnavailableError);
    expect(fs.files().has("campaigns/mine/scenes/s-2.json")).toBe(false);
  });

  test("rejects an empty name", async () => {
    await expect(
      createScene(createMemoryFileSystem(), "mine", { id: "s-1", name: " " }),
    ).rejects.toThrow("A scene needs a name");
  });
});

describe("withMap", () => {
  const asset = {
    path: "library/maps/new.webp",
    hash: `sha256:${"c".repeat(64)}`,
  };

  test("refers to the new map and drops the old map's overrides", () => {
    const scene: Scene = {
      schemaVersion: 3,
      id: "s",
      name: "S",
      map: {
        kind: "video",
        asset: { path: "library/maps/old.mp4", hash: asset.hash },
        overrides: { hall: { hidden: true } },
      },
      tokens: [],
      fog: { levels: {} },
      initiative: null,
    };
    expect(withMap(scene, { ...asset, extra: "dropped" }).map).toEqual({
      kind: "image",
      asset,
      overrides: {},
    });
  });
});

describe("mapDataForChange", () => {
  const level = "Neu";
  const current = {
    grid: { cellSizePx: 72, offsetXPx: 3, offsetYPx: 4 },
    levels: [
      { id: "ground", name: "Unten" },
      { id: "top", name: "Oben" },
    ],
    rooms: [],
  };

  test("a new map takes the old map's grid and levels, so fog and tokens fit", () => {
    expect(mapDataForChange(current, level)).toEqual(current);
  });

  test("resetting the grid keeps the levels", () => {
    expect(mapDataForChange(current, level, { grid: true })).toEqual({
      ...current,
      grid: { cellSizePx: 100, offsetXPx: 0, offsetYPx: 0 },
    });
  });

  test("without an old map the new one gets a single level", () => {
    expect(mapDataForChange(null, level)).toEqual({
      grid: { cellSizePx: 100, offsetXPx: 0, offsetYPx: 0 },
      levels: [{ id: DEFAULT_LEVEL_ID, name: "Neu" }],
      rooms: [],
    });
  });
});

describe("withMap with resets", () => {
  const asset = {
    path: "library/maps/new.webp",
    hash: `sha256:${"c".repeat(64)}`,
  };
  const square = {
    outer: [
      [0, 0],
      [10, 0],
      [10, 10],
    ] as [number, number][],
    holes: [],
  };
  const scene: Scene = {
    schemaVersion: 3,
    id: "s",
    name: "S",
    map: {
      kind: "image",
      asset: {
        path: "library/maps/old.webp",
        hash: `sha256:${"a".repeat(64)}`,
      },
      overrides: {},
    },
    tokens: [
      {
        id: "t-1",
        name: "Goblin",
        size: "small",
        position: { col: 1, row: 2 },
        levelId: "ground",
      },
    ],
    fog: { levels: { ground: { revealed: [square], remembered: [] } } },
    initiative: {
      round: 2,
      activeCombatantId: "c-goblin",
      order: ["c-goblin", "c-wolf"],
      combatants: [
        {
          id: "c-goblin",
          name: "Goblin",
          tokenId: "t-1",
          initiative: 12,
          conditions: [],
        },
        { id: "c-wolf", name: "Wolf", initiative: 8, conditions: [] },
      ],
    },
  };
  test("keeps everything by default", () => {
    const changed = withMap(scene, asset);
    expect(changed.fog).toEqual(scene.fog);
    expect(changed.tokens).toEqual(scene.tokens);
  });

  test("resets fog on request", () => {
    const changed = withMap(scene, asset, { fog: true, grid: true });
    expect(changed.fog).toEqual({ levels: {} });
    expect(changed.tokens).toEqual(scene.tokens);
  });

  test("removing tokens also removes their initiative entries", () => {
    const changed = withMap(scene, asset, { tokens: true });
    expect(changed.tokens).toEqual([]);
    expect(changed.initiative).toMatchObject({
      round: 2,
      activeCombatantId: null,
      order: ["c-wolf"],
    });
    expect(changed.initiative?.combatants.map((c) => c.id)).toEqual(["c-wolf"]);
    expect(changed.fog).toEqual(scene.fog);
  });

  test("results are valid scenes, also when nobody is left or there is no initiative", () => {
    const onlyTokens: Scene = {
      ...scene,
      initiative: scene.initiative && {
        ...scene.initiative,
        order: ["c-goblin"],
        combatants: scene.initiative.combatants.filter(
          (c) => c.tokenId !== undefined,
        ),
      },
    };
    const emptied = withMap(onlyTokens, asset, {
      tokens: true,
      fog: true,
      grid: true,
    });
    expect(emptied.initiative).toEqual({
      round: 0,
      activeCombatantId: null,
      order: [],
      combatants: [],
    });
    expect(() => sceneSchema.parse(emptied)).not.toThrow();
    const noInitiative = withMap({ ...scene, initiative: null }, asset, {
      tokens: true,
    });
    expect(noInitiative.initiative).toBeNull();
    expect(() => sceneSchema.parse(noInitiative)).not.toThrow();
    expect(() =>
      sceneSchema.parse(withMap(scene, asset, { tokens: true })),
    ).not.toThrow();
  });
});

describe("deleteScene", () => {
  test("moves the scene file into the campaign's trash", async () => {
    const fs = createMemoryFileSystem();
    await createScene(fs, "mine", { id: "s-1", name: "Eingang" });
    const trashed = await deleteScene(fs, "mine", "s-1");
    expect(trashed).toMatch(
      /^campaigns\/mine\/\.trash\/[^/]+\/scenes\/s-1\.json$/,
    );
    expect(fs.files().has("campaigns/mine/scenes/s-1.json")).toBe(false);
    expect(JSON.parse(fs.files().get(trashed) ?? "{}")).toMatchObject({
      name: "Eingang",
    });
    expect((await listScenes(fs, "mine")).sceneIds).toEqual([]);
  });

  test("rejects unsafe ids without touching anything", async () => {
    const fs = createMemoryFileSystem({ "campaigns/mine/campaign.json": "{}" });
    await expect(deleteScene(fs, "mine", "../campaign")).rejects.toThrow(
      "Invalid scene id",
    );
    expect(fs.files().has("campaigns/mine/campaign.json")).toBe(true);
  });
});

describe("mapKind", () => {
  test("MP4 and WebM files are video maps, everything else images", () => {
    expect(mapKind("library/maps/fluss.MP4")).toBe("video");
    expect(mapKind("library/maps/fluss.webm")).toBe("video");
    expect(mapKind("library/maps/hoehle.webp")).toBe("image");
  });

  test("a scene changed to a video map gets kind video", () => {
    const scene = {
      schemaVersion: 3 as const,
      id: "s",
      name: "S",
      map: null,
      tokens: [],
      fog: { levels: {} },
      initiative: null,
    };
    const asset = {
      path: "library/maps/fluss.mp4",
      hash: `sha256:${"d".repeat(64)}`,
    };
    expect(withMap(scene, asset).map?.kind).toBe("video");
  });
});

describe("sub-scenes (T-152)", () => {
  test("a new scene can be a sub-scene of another one", async () => {
    const fs = createMemoryFileSystem();
    const scene = await createScene(fs, "mine", {
      id: "kammer",
      name: "Geheimkammer",
      parentSceneId: "krypta",
    });
    expect(scene.parentSceneId).toBe("krypta");
    expect(await loadScene(fs, "mine", "kammer")).toMatchObject({
      status: "ok",
      value: { parentSceneId: "krypta" },
    });
  });

  test("reparentScene moves a scene up or under another parent, keeping the rest", async () => {
    const fs = createMemoryFileSystem();
    await createScene(fs, "mine", {
      id: "kammer",
      name: "Geheimkammer",
      parentSceneId: "krypta",
    });
    const raw = JSON.parse(
      fs.files().get("campaigns/mine/scenes/kammer.json") ?? "{}",
    ) as Record<string, unknown>;
    // A field this version does not know survives (ADR-0006, loose schemas).
    await fs.writeAtomic(
      "campaigns/mine/scenes/kammer.json",
      JSON.stringify({ ...raw, future: 1 }),
    );

    const top = await reparentScene(fs, "mine", "kammer", null);
    expect(top.parentSceneId).toBeUndefined();
    const stored = JSON.parse(
      fs.files().get("campaigns/mine/scenes/kammer.json") ?? "{}",
    ) as Record<string, unknown>;
    expect(stored).not.toHaveProperty("parentSceneId");
    expect(stored["future"]).toBe(1);

    await reparentScene(fs, "mine", "kammer", "burg");
    expect(await loadScene(fs, "mine", "kammer")).toMatchObject({
      value: { parentSceneId: "burg", name: "Geheimkammer" },
    });
  });

  test("reparentScene fails for a scene that cannot be read", async () => {
    const fs = createMemoryFileSystem();
    await expect(reparentScene(fs, "mine", "gone", null)).rejects.toThrow(
      "cannot be read",
    );
  });
});
