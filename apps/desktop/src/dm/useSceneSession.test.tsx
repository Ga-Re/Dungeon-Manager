import type { MapImage } from "@dungeon-manager/renderer";
import type { Scene, ViewerScene } from "@dungeon-manager/schema";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { fakeMapService } from "../fake-renderer.test-data.js";
import { createI18n } from "@dungeon-manager/ui";
import type { PlayerFeedSender } from "../platform/player-feed.js";
import { fakeLibraryService } from "./fake-library.test-data.js";
import { CampaignPanel } from "./CampaignPanel.js";
import { OpenScenePanel } from "./OpenScenePanel.js";
import { MapViewContext } from "./MapView.js";
import { PlayerFeedContext } from "./player-feed-context.js";
import { RELOAD_DELAY_MS } from "./useLibraryChanges.js";
import { ActiveWorkspaceContext, type Workspace } from "./shell/workspace.js";
import { SceneRescueContext, type SceneRescue } from "./rescue-copies.js";

const campaign = JSON.stringify({
  schemaVersion: 2,
  id: "c",
  name: "Mine",
  players: [],
  visibilityDefaults: {},
});

// A hidden token: the TV must get the scene without it.
const scene: Scene = {
  schemaVersion: 3,
  id: "s",
  name: "Höhle",
  map: null,
  tokens: [
    {
      id: "doppelganger",
      name: "Doppelgänger",
      size: "medium",
      position: { col: 1, row: 1 },
      levelId: "ground",
      visibility: { token: "hidden" },
    },
  ],
  fog: { levels: {} },
  initiative: null,
};

function fakeFeed() {
  const shown: (ViewerScene | null)[] = [];
  const feed: PlayerFeedSender = {
    show: vi.fn((next: ViewerScene | null) => {
      shown.push(next);
    }),
    rotate: vi.fn(),
    rotation: 0,
    calibrate: vi.fn(),
  };
  return { feed, shown };
}

const hash = `sha256:${"a".repeat(64)}`;
const HOEHLE = "library/maps/hoehle.png";
/** The cave map's sidecar: its grid and its one level (ADR-0012). */
const hoehleSidecar = JSON.stringify({
  schemaVersion: 1,
  original: { hash },
  map: {
    grid: { cellSizePx: 100, offsetXPx: 0, offsetYPx: 0 },
    levels: [{ id: "ground", name: "Erdgeschoss" }],
    rooms: [],
  },
});

/** A scene with the cave map, for tests outside the block that defines `mapped`. */
const mappedScene: Scene = {
  ...scene,
  tokens: [],
  map: { kind: "image", asset: { path: HOEHLE, hash }, overrides: {} },
};

function renderScene(
  files: Record<string, string | { readonly placeholder: true }>,
  opened: Scene = scene,
  rescue: SceneRescue | null = null,
) {
  const library = fakeLibraryService("/lib", {
    [`${HOEHLE}.dm.json`]: hoehleSidecar,
    ...files,
  });
  const tv = fakeFeed();
  const maps = fakeMapService(() =>
    Promise.resolve({ width: 1000, height: 500 } as unknown as MapImage),
  );
  const i18n = createI18n("de");
  const tree = (workspace: Workspace) => (
    <I18nextProvider i18n={i18n}>
      <SceneRescueContext value={rescue}>
        <ActiveWorkspaceContext value={workspace}>
          <PlayerFeedContext value={tv.feed}>
            <MapViewContext value={maps.service}>
              <OpenScenePanel
                service={library.service}
                slug="mine"
                scene={opened}
                newId={() => "new-level"}
                onChanged={() => undefined}
                onDeleted={() => undefined}
                onClose={() => undefined}
              />
            </MapViewContext>
          </PlayerFeedContext>
        </ActiveWorkspaceContext>
      </SceneRescueContext>
    </I18nextProvider>
  );
  const result = render(tree("gameOrchestrator"));
  /** The DM switches the window to another workspace (T-174); the scene stays mounted. */
  const showWorkspace = (workspace: Workspace) => {
    result.rerender(tree(workspace));
  };
  return { tv, library, maps, showWorkspace, ...result };
}

describe("the open scene on the TV", () => {
  test("only the projection for the table is sent, and nothing after closing", async () => {
    const { tv, unmount } = renderScene({
      "campaigns/mine/campaign.json": campaign,
    });
    await waitFor(() => {
      expect(tv.shown.at(-1)).toMatchObject({ id: "s", name: "Höhle" });
    });
    expect(JSON.stringify(tv.shown)).not.toContain("doppelganger");
    expect(JSON.stringify(tv.shown)).not.toContain("schemaVersion");
    unmount();
    expect(tv.shown.at(-1)).toBeNull();
  });

  test("an unreadable campaign keeps the TV black and says so", async () => {
    const { tv } = renderScene({ "campaigns/mine/campaign.json": "{" });
    expect(
      await screen.findByText(/kann nicht auf dem TV gezeigt werden/),
    ).toBeTruthy();
    expect(tv.shown.filter((shown) => shown !== null)).toEqual([]);
  });
});

// jsdom does no layout: give the map view a box, so the map loads and the tools are enabled.
const box = {
  width: Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientWidth"),
  height: Object.getOwnPropertyDescriptor(
    HTMLElement.prototype,
    "clientHeight",
  ),
};

describe("editing the fog", () => {
  beforeAll(() => {
    Object.defineProperty(HTMLElement.prototype, "clientWidth", {
      configurable: true,
      get: () => 1000,
    });
    Object.defineProperty(HTMLElement.prototype, "clientHeight", {
      configurable: true,
      get: () => 500,
    });
  });
  afterAll(() => {
    if (box.width)
      Object.defineProperty(HTMLElement.prototype, "clientWidth", box.width);
    if (box.height)
      Object.defineProperty(HTMLElement.prototype, "clientHeight", box.height);
  });

  const mapped: Scene = {
    ...scene,
    tokens: [],
    map: { kind: "image", asset: { path: HOEHLE, hash }, overrides: {} },
  };
  const savedFog = (files: ReadonlyMap<string, string>) =>
    (JSON.parse(files.get("campaigns/mine/scenes/s.json") ?? "{}") as Scene)
      .fog;

  test("reveal all reaches the TV at once, is saved and can be undone", async () => {
    const { tv, library } = renderScene(
      { "campaigns/mine/campaign.json": campaign },
      mapped,
    );
    const revealAll = await screen.findByRole("button", {
      name: "Alles aufdecken",
    });
    await waitFor(() => {
      expect(revealAll).toHaveProperty("disabled", false);
    });
    const before = tv.shown.length;

    fireEvent.click(revealAll);
    // No blank TV in between: the next message is the new state.
    expect(tv.shown.slice(before)).toHaveLength(1);
    expect(tv.shown.at(-1)?.fog["ground"]?.revealed).toHaveLength(1);
    await waitFor(() => {
      expect(
        savedFog(library.fs.files()).levels["ground"]?.revealed,
      ).toHaveLength(1);
    });

    fireEvent.keyDown(window, { key: "z", ctrlKey: true });
    expect(tv.shown.at(-1)?.fog["ground"]?.revealed ?? []).toHaveLength(0);
    await waitFor(() => {
      expect(
        savedFog(library.fs.files()).levels["ground"]?.revealed ?? [],
      ).toHaveLength(0);
    });

    fireEvent.click(screen.getByRole("button", { name: "Wiederherstellen" }));
    expect(tv.shown.at(-1)?.fog["ground"]?.revealed).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Alles verdecken" }));
    expect(tv.shown.at(-1)?.fog["ground"]?.revealed ?? []).toHaveLength(0);
  });

  test("undo acts on the scene only while the Game-Orchestrator shows; leaving it ends the fog tool (T-174)", async () => {
    const { tv, showWorkspace } = renderScene(
      { "campaigns/mine/campaign.json": campaign },
      mapped,
    );
    fireEvent.click(await enabled("Alles aufdecken"));
    const tool = screen.getByRole("button", { name: "Aufdecken" });
    fireEvent.click(tool);
    expect(tool.getAttribute("aria-pressed")).toBe("true");

    showWorkspace("mapForge");
    // Another workspace's undo never reaches the scene: keys and title bar buttons.
    fireEvent.keyDown(window, { key: "z", ctrlKey: true });
    expect(tv.shown.at(-1)?.fog["ground"]?.revealed).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Rückgängig" })).toHaveProperty(
      "disabled",
      true,
    );

    showWorkspace("gameOrchestrator");
    expect(
      screen
        .getByRole("button", { name: "Aufdecken" })
        .getAttribute("aria-pressed"),
    ).toBe("false");
    expect(
      screen
        .getByRole("button", { name: "Verschieben" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    fireEvent.keyDown(window, { key: "z", ctrlKey: true });
    expect(tv.shown.at(-1)?.fog["ground"]?.revealed ?? []).toHaveLength(0);
  });

  test("undo keys are left to text fields", async () => {
    const { tv } = renderScene(
      { "campaigns/mine/campaign.json": campaign },
      mapped,
    );
    const revealAll = await screen.findByRole("button", {
      name: "Alles aufdecken",
    });
    await waitFor(() => {
      expect(revealAll).toHaveProperty("disabled", false);
    });
    fireEvent.click(revealAll);
    const field = document.createElement("input");
    document.body.appendChild(field);
    fireEvent.keyDown(field, { key: "z", metaKey: true });
    expect(tv.shown.at(-1)?.fog["ground"]?.revealed).toHaveLength(1);
    field.remove();
  });

  const enabled = async (name: string) => {
    const button = await screen.findByRole("button", { name });
    await waitFor(() => {
      expect(button).toHaveProperty("disabled", false);
    });
    return button;
  };

  test("undo keys still work while a fog tool or the brush size has focus", async () => {
    const { tv } = renderScene(
      { "campaigns/mine/campaign.json": campaign },
      mapped,
    );
    fireEvent.click(await enabled("Alles aufdecken"));
    const tool = screen.getByRole("button", { name: "Aufdecken" });
    fireEvent.click(tool);
    expect(tool.getAttribute("aria-pressed")).toBe("true");
    fireEvent.keyDown(tool, { key: "z", ctrlKey: true });
    expect(tv.shown.at(-1)?.fog["ground"]?.revealed ?? []).toHaveLength(0);

    fireEvent.click(screen.getByRole("button", { name: "Alles aufdecken" }));
    fireEvent.click(screen.getByRole("button", { name: "Pinsel" }));
    const size = screen.getByRole("slider", { name: /Pinselgröße/ });
    fireEvent.keyDown(size, { key: "z", ctrlKey: true });
    expect(tv.shown.at(-1)?.fog["ground"]?.revealed ?? []).toHaveLength(0);
  });

  test("the title bar says saving while a write is pending, then saved", async () => {
    const { library } = renderScene(
      { "campaigns/mine/campaign.json": campaign },
      mapped,
    );
    const write = library.fs.writeAtomic.bind(library.fs);
    let release: () => void = () => undefined;
    library.fs.writeAtomic = (...args) =>
      new Promise((resolve) => {
        release = () => {
          resolve(write(...args));
        };
      });
    expect(screen.getByText("Gespeichert")).toBeTruthy();
    fireEvent.click(await enabled("Alles aufdecken"));
    expect(await screen.findByText("Speichert …")).toBeTruthy();
    release();
    expect(await screen.findByText("Gespeichert")).toBeTruthy();
    expect(screen.queryByText("Speichert …")).toBeNull();
  });

  test("a successful save leaves a rescue copy from an earlier session to the DM (T-114b)", async () => {
    const rescue = { keep: vi.fn(), drop: vi.fn() };
    const { library } = renderScene(
      { "campaigns/mine/campaign.json": campaign },
      mapped,
      rescue,
    );
    fireEvent.click(await enabled("Alles aufdecken"));
    await waitFor(() => {
      expect(library.fs.files().has("campaigns/mine/scenes/s.json")).toBe(true);
    });
    // The scene opened from disk is older than a copy kept before a crash: never dropped here.
    expect(rescue.drop).not.toHaveBeenCalled();
    expect(rescue.keep).not.toHaveBeenCalled();
  });

  test("a failed save is reported, blocks a map change and is cleared by the next save", async () => {
    const rescue = { keep: vi.fn(), drop: vi.fn() };
    const { library } = renderScene(
      { "campaigns/mine/campaign.json": campaign },
      mapped,
      rescue,
    );
    const write = library.fs.writeAtomic.bind(library.fs);
    library.fs.writeAtomic = () =>
      Promise.reject(new Error("Datenträger voll"));
    fireEvent.click(await enabled("Alles aufdecken"));
    expect(
      await screen.findByText(/konnte nicht gespeichert werden/),
    ).toBeTruthy();
    // Kept on this device until it is saved (T-114b).
    expect(rescue.keep).toHaveBeenCalledWith(
      "mine",
      expect.objectContaining({ id: "s" }),
    );

    library.service.importMap.mockResolvedValue({
      path: "library/maps/neu.webp",
      hash: `sha256:${"b".repeat(64)}`,
    });
    fireEvent.click(screen.getByRole("button", { name: "Karte ändern …" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "Karte übernehmen" }),
    );
    expect(await screen.findByText(/noch nicht gespeichert/)).toBeTruthy();
    expect(library.fs.files().has("campaigns/mine/scenes/s.json")).toBe(false);

    library.fs.writeAtomic = write;
    fireEvent.click(screen.getByRole("button", { name: "Erneut speichern" }));
    await waitFor(() => {
      expect(screen.queryByText(/konnte nicht gespeichert werden/)).toBeNull();
    });
    expect(library.fs.files().has("campaigns/mine/scenes/s.json")).toBe(true);
    expect(rescue.drop).toHaveBeenLastCalledWith("mine", "s");
  });

  test("clicking the open scene in the list keeps its edits and undo history", async () => {
    const library = fakeLibraryService("/lib", {
      "campaigns/mine/campaign.json": campaign,
      "campaigns/mine/scenes/s.json": JSON.stringify(mapped),
      [`${HOEHLE}.dm.json`]: hoehleSidecar,
    });
    const tv = fakeFeed();
    const maps = fakeMapService(() =>
      Promise.resolve({ width: 1000, height: 500 } as unknown as MapImage),
    );
    render(
      <I18nextProvider i18n={createI18n("de")}>
        <PlayerFeedContext value={tv.feed}>
          <MapViewContext value={maps.service}>
            <CampaignPanel
              service={library.service}
              slug="mine"
              name="Mine"
              newId={() => "id"}
            />
          </MapViewContext>
        </PlayerFeedContext>
      </I18nextProvider>,
    );
    fireEvent.click(
      await screen.findByText("Höhle", { selector: ".dm-tree-label" }),
    );
    // The list reloads (as after the watcher reports a save) while the save is still pending,
    // so its copy of the scene is the old one.
    library.fs.writeAtomic = () => new Promise(() => undefined);
    fireEvent.click(await enabled("Alles aufdecken"));
    library.emit(["campaigns/mine/scenes/s.json"]);
    await new Promise((resolve) => setTimeout(resolve, RELOAD_DELAY_MS + 100));
    fireEvent.click(screen.getByText("Höhle", { selector: ".dm-tree-label" }));
    expect(tv.shown.at(-1)?.fog["ground"]?.revealed).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Rückgängig" })).toHaveProperty(
      "disabled",
      false,
    );
  });
});

describe("the map's data (ADR-0012, T-134d)", () => {
  test("a version 2 scene moves its grid and levels into the map's sidecar on opening", async () => {
    const legacy: Scene = {
      ...scene,
      tokens: [],
      map: {
        kind: "image",
        asset: { path: "library/maps/alt.png", hash },
        overrides: {},
        legacyMap: {
          grid: { cellSizePx: 70, offsetXPx: 0, offsetYPx: 0 },
          levels: [{ id: "old", name: "Alte Ebene" }],
        },
      },
    };
    const { library, tv } = renderScene(
      { "campaigns/mine/campaign.json": campaign },
      legacy,
    );
    await waitFor(() => {
      expect(
        JSON.parse(
          library.fs.files().get("campaigns/mine/scenes/s.json") ?? "{}",
        ),
      ).toMatchObject({ map: { overrides: {} } });
    });
    const saved = JSON.parse(
      library.fs.files().get("campaigns/mine/scenes/s.json") ?? "{}",
    ) as Scene;
    expect(saved.map?.legacyMap).toBeUndefined();
    expect(
      JSON.parse(
        library.fs.files().get("library/maps/alt.png.dm.json") ?? "{}",
      ),
    ).toMatchObject({
      map: { grid: { cellSizePx: 70 }, levels: [{ id: "old" }] },
    });
    await waitFor(() => {
      expect(tv.shown.at(-1)?.map?.currentLevelId).toBe("old");
    });
  });

  test("a change of the map's data on disk reaches the TV only once the DM accepts it", async () => {
    const { library, tv } = renderScene(
      { "campaigns/mine/campaign.json": campaign },
      mappedScene,
    );
    await waitFor(() => {
      expect(tv.shown.at(-1)?.map?.grid.cellSizePx).toBe(100);
    });
    // Our own unchanged file coming back from the watcher is read again but asks nothing.
    const read = vi.spyOn(library.fs, "read");
    const sidecarReads = () =>
      read.mock.calls.filter(([path]) => path === `${HOEHLE}.dm.json`).length;
    library.emit([`${HOEHLE}.dm.json`]);
    await waitFor(() => {
      expect(sidecarReads()).toBe(1);
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.queryByText(/wurden geändert/)).toBeNull();

    // A sidecar that cannot be read for a moment keeps what the TV shows, without asking.
    const content = library.fs.files().get(`${HOEHLE}.dm.json`) ?? "";
    await library.fs.writeAtomic(`${HOEHLE}.dm.json`, "{");
    library.emit([`${HOEHLE}.dm.json`]);
    await waitFor(() => {
      expect(sidecarReads()).toBe(2);
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.queryByText(/wurden geändert/)).toBeNull();
    expect(tv.shown.at(-1)?.map?.grid.cellSizePx).toBe(100);
    await library.fs.writeAtomic(`${HOEHLE}.dm.json`, content);

    // Another device recalibrates the map.
    await library.fs.writeAtomic(
      `${HOEHLE}.dm.json`,
      hoehleSidecar.replace('"cellSizePx":100', '"cellSizePx":50'),
    );
    library.emit([`${HOEHLE}.dm.json`]);
    expect(await screen.findByText(/wurden geändert/)).toBeTruthy();
    expect(tv.shown.at(-1)?.map?.grid.cellSizePx).toBe(100);

    fireEvent.click(
      screen.getByRole("button", { name: "Änderung übernehmen" }),
    );
    await waitFor(() => {
      expect(tv.shown.at(-1)?.map?.grid.cellSizePx).toBe(50);
    });
    expect(screen.queryByText(/wurden geändert/)).toBeNull();
  });

  test("map data arriving after it was not available is shown without asking", async () => {
    const { library, tv } = renderScene(
      {
        "campaigns/mine/campaign.json": campaign,
        [`${HOEHLE}.dm.json`]: { placeholder: true },
      },
      mappedScene,
    );
    expect(
      await screen.findByText(/noch nicht heruntergeladen oder beschädigt/),
    ).toBeTruthy();
    await library.fs.writeAtomic(`${HOEHLE}.dm.json`, hoehleSidecar);
    library.emit([`${HOEHLE}.dm.json`]);
    await waitFor(() => {
      expect(tv.shown.at(-1)?.map?.grid.cellSizePx).toBe(100);
    });
    expect(screen.queryByText(/wurden geändert/)).toBeNull();
  });

  test("a map whose data is not downloaded yet shows nothing and says so", async () => {
    const { tv } = renderScene(
      {
        "campaigns/mine/campaign.json": campaign,
        [`${HOEHLE}.dm.json`]: { placeholder: true },
      },
      mappedScene,
    );
    expect(
      await screen.findByText(/noch nicht heruntergeladen oder beschädigt/),
    ).toBeTruthy();
    await waitFor(() => {
      expect(tv.shown.at(-1)).toMatchObject({ id: "s", map: null });
    });
    expect(
      screen.queryByRole("button", { name: "Alles aufdecken" }),
    ).toBeNull();
  });
});

describe("hints about the map's data (T-134d)", () => {
  const files = { "campaigns/mine/campaign.json": campaign };

  test("a scene whose own copy differs from the map's data plays its copy and says so", async () => {
    const differing: Scene = {
      ...mappedScene,
      map: {
        kind: "image",
        asset: { path: HOEHLE, hash },
        overrides: {},
        legacyMap: {
          grid: { cellSizePx: 100, offsetXPx: 0, offsetYPx: 0 },
          levels: [{ id: "ground", name: "Taverne" }],
        },
      },
    };
    const { tv } = renderScene(files, differing);
    expect(
      await screen.findByText(/eigenes Raster oder eigene Ebenen/),
    ).toBeTruthy();
    await waitFor(() => {
      expect(tv.shown.at(-1)?.map?.levels).toEqual([
        { id: "ground", name: "Taverne" },
      ]);
    });
  });

  test("a map without data plays one default level, which a map change keeps", async () => {
    const plain: Scene = {
      ...mappedScene,
      map: {
        kind: "image",
        asset: { path: "library/maps/leer.png", hash },
        overrides: {},
      },
    };
    const { tv, library } = renderScene(files, plain);
    await waitFor(() => {
      expect(tv.shown.at(-1)?.map?.currentLevelId).toBe("level-1");
    });
    library.service.importMap.mockResolvedValue({
      path: "library/maps/neu.png",
      hash,
    });
    fireEvent.click(screen.getByRole("button", { name: "Karte ändern …" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "Karte übernehmen" }),
    );
    await waitFor(() => {
      expect(
        JSON.parse(
          library.fs.files().get("library/maps/neu.png.dm.json") ?? "{}",
        ),
      ).toMatchObject({ map: { levels: [{ id: "level-1" }] } });
    });
  });

  test("a missing sidecar of a map whose scene uses other levels counts as not synced yet", async () => {
    const used: Scene = {
      ...mappedScene,
      map: {
        kind: "image",
        asset: { path: "library/maps/leer.png", hash },
        overrides: {},
      },
      fog: { levels: { cellar: { revealed: [], remembered: [] } } },
    };
    renderScene(files, used);
    expect(
      await screen.findByText(/noch nicht heruntergeladen oder beschädigt/),
    ).toBeTruthy();
  });

  test("overrides of elements the map no longer has are pointed out", async () => {
    const orphaned: Scene = {
      ...mappedScene,
      map: {
        kind: "image",
        asset: { path: HOEHLE, hash },
        overrides: { "gone-room": { hidden: true } },
      },
    };
    renderScene(files, orphaned);
    expect(
      await screen.findByText(/einem Element, das die Karte nicht mehr hat/),
    ).toBeTruthy();
  });
});
