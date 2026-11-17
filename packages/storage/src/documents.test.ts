import type { Campaign, Scene } from "@dungeon-manager/schema";
import { describe, expect, test } from "vitest";
import {
  createMemoryFileSystem,
  ensureLibraryLayout,
  LIBRARY_DIRECTORIES,
  listScenes,
  loadCampaign,
  loadScene,
  saveCampaign,
  saveScene,
} from "./index.js";

const campaign: Campaign = {
  schemaVersion: 1,
  id: "campaign-1",
  name: "Die verlorene Mine",
  players: [],
  visibilityDefaults: {},
};

const scene: Scene = {
  schemaVersion: 1,
  id: "scene-1",
  name: "Eingang",
  map: null,
  tokens: [],
  fog: { levels: {} },
  initiative: null,
};

describe("library layout", () => {
  test("creates every directory of an empty library and is idempotent", async () => {
    const fs = createMemoryFileSystem();
    await ensureLibraryLayout(fs);
    await ensureLibraryLayout(fs);
    expect(fs.directories()).toEqual(
      expect.arrayContaining([...LIBRARY_DIRECTORIES]),
    );
  });
});

describe("campaign.json", () => {
  test("round-trips through the file system as pretty JSON", async () => {
    const fs = createMemoryFileSystem();
    await saveCampaign(fs, "mine", campaign);

    expect(fs.files().get("campaigns/mine/campaign.json")).toBe(
      `${JSON.stringify(campaign, null, 2)}\n`,
    );
    expect(await loadCampaign(fs, "mine")).toEqual({
      status: "ok",
      value: campaign,
    });
  });

  test("migrates on load and keeps unknown fields", async () => {
    const fs = createMemoryFileSystem({
      "campaigns/mine/campaign.json": JSON.stringify({
        ...campaign,
        fromNewerTool: true,
      }),
    });
    expect(await loadCampaign(fs, "mine")).toEqual({
      status: "ok",
      value: { ...campaign, fromNewerTool: true },
    });
  });

  test.each([
    ["missing", {}, { status: "missing" }],
    [
      "not downloaded yet (placeholder)",
      { "campaigns/mine/campaign.json": { placeholder: true } },
      { status: "notAvailable" },
    ],
    [
      "broken JSON",
      { "campaigns/mine/campaign.json": "{ nope" },
      { status: "invalid", reason: "json" },
    ],
    [
      "schema violation",
      {
        "campaigns/mine/campaign.json": JSON.stringify({
          ...campaign,
          name: "",
        }),
      },
      { status: "invalid", reason: "schema" },
    ],
    [
      "from a newer app",
      {
        "campaigns/mine/campaign.json": JSON.stringify({
          ...campaign,
          schemaVersion: 9,
        }),
      },
      { status: "invalid", reason: "newerVersion" },
    ],
  ] as const)(
    "reports a %s file instead of throwing",
    async (_case, files, expected) => {
      expect(await loadCampaign(createMemoryFileSystem(files), "mine")).toEqual(
        expected,
      );
    },
  );

  test("refuses to write an invalid campaign or an unsafe slug", async () => {
    const fs = createMemoryFileSystem();
    await expect(
      saveCampaign(fs, "mine", { ...campaign, name: "" }),
    ).rejects.toThrow();
    await expect(saveCampaign(fs, "../evil", campaign)).rejects.toThrow(
      "Invalid campaign slug",
    );
    expect(fs.files().size).toBe(0);
  });

  test("an unsafe slug is never read either", async () => {
    expect(await loadCampaign(createMemoryFileSystem(), "../evil")).toEqual({
      status: "invalid",
      reason: "path",
    });
  });
});

describe("scene files", () => {
  test("round-trip by id", async () => {
    const fs = createMemoryFileSystem();
    await saveScene(fs, "mine", scene);
    expect(fs.files().has("campaigns/mine/scenes/scene-1.json")).toBe(true);
    expect(await loadScene(fs, "mine", "scene-1")).toEqual({
      status: "ok",
      value: scene,
    });
  });

  test("an id that is not a valid file name is rejected", async () => {
    expect(await loadScene(createMemoryFileSystem(), "mine", "../x")).toEqual({
      status: "invalid",
      reason: "path",
    });
  });

  test("listing returns scene ids and conflict copies separately, ignoring other files", async () => {
    const fs = createMemoryFileSystem({
      "campaigns/mine/scenes/scene-1.json": "{}",
      "campaigns/mine/scenes/scene-2.json": "{}",
      "campaigns/mine/scenes/scene-1 (conflicted copy 2026-11-17).json": "{}",
      "campaigns/mine/scenes/scene-2.json.tmp": "{}",
      "campaigns/mine/scenes/notes.txt": "x",
    });
    expect(await listScenes(fs, "mine")).toEqual({
      sceneIds: ["scene-1", "scene-2"],
      conflicts: [
        {
          copy: "scene-1 (conflicted copy 2026-11-17).json",
          original: "scene-1.json",
          provider: "Dropbox",
        },
      ],
    });
  });

  test("tells OneDrive copies from real scenes by the id inside the file", async () => {
    const file = (id: string) => JSON.stringify({ ...scene, id });
    const fs = createMemoryFileSystem({
      "campaigns/mine/scenes/keller.json": file("keller"),
      // A real scene whose name merely looks like a OneDrive copy of "keller".
      "campaigns/mine/scenes/keller-Ost.json": file("keller-Ost"),
      "campaigns/mine/scenes/keller-DESKTOP-4F2KQ1.json": file("keller"),
      // Content unknown: listed as a scene, so nothing is hidden.
      "campaigns/mine/scenes/keller-MacBook-Air.json": { placeholder: true },
    });
    expect(await listScenes(fs, "mine")).toEqual({
      sceneIds: ["keller", "keller-MacBook-Air", "keller-Ost"],
      conflicts: [
        {
          copy: "keller-DESKTOP-4F2KQ1.json",
          original: "keller.json",
          provider: "OneDrive",
        },
      ],
    });
  });

  test("an id that is a reserved Windows name is not saved", async () => {
    const fs = createMemoryFileSystem();
    await expect(
      saveScene(fs, "mine", { ...scene, id: "nul" }),
    ).rejects.toThrow("Invalid scene id");
    expect(fs.files().size).toBe(0);
  });

  test("a failing read is reported, not thrown", async () => {
    const fs = createMemoryFileSystem();
    fs.read = () => Promise.reject(new Error("EACCES"));
    expect(await loadScene(fs, "mine", "scene-1")).toEqual({
      status: "unreadable",
    });
  });

  test("a campaign without scenes lists nothing", async () => {
    expect(await listScenes(createMemoryFileSystem(), "mine")).toEqual({
      sceneIds: [],
      conflicts: [],
    });
  });
});
