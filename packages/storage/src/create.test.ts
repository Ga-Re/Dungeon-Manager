import { sceneSchema, type Scene } from "@dungeon-manager/schema";
import { describe, expect, test } from "vitest";
import {
  createCampaign,
  createMemoryFileSystem,
  createScene,
  deleteScene,
  listScenes,
  mapKind,
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
        schemaVersion: 1,
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
      schemaVersion: 1,
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

  test("can start with a map, which is validated", async () => {
    const fs = createMemoryFileSystem();
    const map = {
      kind: "image" as const,
      asset: {
        path: "library/maps/cave.webp",
        hash: `sha256:${"a".repeat(64)}`,
      },
      grid: { cellSizePx: 100, offsetXPx: 0, offsetYPx: 0 },
      levels: [{ id: "level-1", name: "Erdgeschoss" }],
    };
    const scene = await createScene(fs, "mine", {
      id: "s-2",
      name: "Höhle",
      map,
    });
    expect(scene.map).toEqual(map);
    await expect(
      createScene(fs, "mine", {
        id: "s-3",
        name: "Kaputt",
        map: { ...map, asset: { path: "../x.webp", hash: "nope" } },
      }),
    ).rejects.toThrow();
    expect(fs.files().has("campaigns/mine/scenes/s-3.json")).toBe(false);
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

  test("gives a scene without a map a single-level image map", () => {
    expect(
      withMap(
        {
          schemaVersion: 1,
          id: "s",
          name: "S",
          map: null,
          tokens: [],
          fog: { levels: {} },
          initiative: null,
        },
        asset,
        { id: "level-1", name: "Erdgeschoss" },
      ).map,
    ).toEqual({
      kind: "image",
      asset,
      grid: { cellSizePx: 100, offsetXPx: 0, offsetYPx: 0 },
      levels: [{ id: "level-1", name: "Erdgeschoss" }],
    });
  });

  test("replaces only the image of an existing map, which becomes an image map", () => {
    const map = {
      kind: "video" as const,
      asset: {
        path: "library/maps/old.webp",
        hash: `sha256:${"a".repeat(64)}`,
        extra: "dropped",
      },
      grid: { cellSizePx: 72, offsetXPx: 3, offsetYPx: 4 },
      levels: [
        { id: "ground", name: "Unten" },
        { id: "top", name: "Oben" },
      ],
    };
    const scene = {
      schemaVersion: 1 as const,
      id: "s",
      name: "S",
      map,
      tokens: [],
      fog: { levels: {} },
      initiative: null,
    };
    expect(withMap(scene, asset, { id: "unused", name: "unused" }).map).toEqual(
      {
        ...map,
        kind: "image",
        asset: { path: asset.path, hash: asset.hash },
      },
    );
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
    schemaVersion: 1,
    id: "s",
    name: "S",
    map: {
      kind: "image",
      asset: {
        path: "library/maps/old.webp",
        hash: `sha256:${"a".repeat(64)}`,
      },
      grid: { cellSizePx: 72, offsetXPx: 3, offsetYPx: 4 },
      levels: [{ id: "ground", name: "Unten" }],
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
  const level = { id: "unused", name: "unused" };

  test("keeps everything by default", () => {
    const changed = withMap(scene, asset, level);
    expect(changed.fog).toEqual(scene.fog);
    expect(changed.tokens).toEqual(scene.tokens);
    expect(changed.map?.grid).toEqual(scene.map?.grid);
  });

  test("resets fog and grid on request, keeping levels", () => {
    const changed = withMap(scene, asset, level, { fog: true, grid: true });
    expect(changed.fog).toEqual({ levels: {} });
    expect(changed.map?.grid).toEqual({
      cellSizePx: 100,
      offsetXPx: 0,
      offsetYPx: 0,
    });
    expect(changed.map?.levels).toEqual(scene.map?.levels);
    expect(changed.tokens).toEqual(scene.tokens);
  });

  test("removing tokens also removes their initiative entries", () => {
    const changed = withMap(scene, asset, level, { tokens: true });
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
    const emptied = withMap(onlyTokens, asset, level, {
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
    const noInitiative = withMap({ ...scene, initiative: null }, asset, level, {
      tokens: true,
    });
    expect(noInitiative.initiative).toBeNull();
    expect(() => sceneSchema.parse(noInitiative)).not.toThrow();
    expect(() =>
      sceneSchema.parse(withMap(scene, asset, level, { tokens: true })),
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
      schemaVersion: 1 as const,
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
    expect(withMap(scene, asset, { id: "l", name: "L" }).map?.kind).toBe(
      "video",
    );
  });
});
