import { describe, expect, test } from "vitest";
import {
  createCampaign,
  createMemoryFileSystem,
  createScene,
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
