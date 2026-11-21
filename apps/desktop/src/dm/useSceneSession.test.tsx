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
import { TvViewContext, type TvView } from "./tv-view-context.js";

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
  const setViewCenter = vi.fn<PlayerFeedSender["setViewCenter"]>();
  const feed: PlayerFeedSender = {
    show: vi.fn((next: ViewerScene | null) => {
      shown.push(next);
    }),
    rotate: vi.fn(),
    rotation: 0,
    calibrate: vi.fn(),
    showCheckSquare: vi.fn(),
    showGrid: vi.fn(),
    setViewCenter,
  };
  return { feed, shown, setViewCenter };
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
  tvView: TvView | null = null,
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
  let nextId = 0;
  const tree = (workspace: Workspace) => (
    <I18nextProvider i18n={i18n}>
      <SceneRescueContext value={rescue}>
        <ActiveWorkspaceContext value={workspace}>
          <PlayerFeedContext value={tv.feed}>
            <TvViewContext value={tvView}>
              <MapViewContext value={maps.service}>
                <OpenScenePanel
                  service={library.service}
                  slug="mine"
                  scene={opened}
                  newId={() => `new-${String(++nextId)}`}
                  onChanged={() => undefined}
                  onDeleted={() => undefined}
                  onClose={() => undefined}
                />
              </MapViewContext>
            </TvViewContext>
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
    // jsdom implements no pointer capture.
    HTMLElement.prototype.setPointerCapture = () => undefined;
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

  test("on a calibrated TV, the scene on it shows the TV's view as a frame the DM moves (T-106c)", async () => {
    // 1600 × 800 px at 200 px per cell: 8 × 4 cells of the map's 100 px.
    const { tv } = renderScene(
      { "campaigns/mine/campaign.json": campaign },
      mapped,
      null,
      { display: { width: 1600, height: 800 }, pxPerCell: 200, rotation: 0 },
    );
    const frame = await screen.findByRole("button", {
      name: /Ausschnitt des TVs/,
    });
    // Centred on the 1000 × 500 map until moved: the TV gets no centre of its own.
    expect(tv.setViewCenter).toHaveBeenLastCalledWith(null);
    fireEvent.keyDown(frame, { key: "ArrowRight" });
    expect(tv.setViewCenter).toHaveBeenLastCalledWith({ x: 600, y: 250 });
  });

  test("the DM creates tokens: on the free cell nearest the map's middle, drawn, saved, undoable (T-107a)", async () => {
    const { maps, library } = renderScene(
      { "campaigns/mine/campaign.json": campaign },
      mapped,
    );
    const create = async (name: string, size: string) => {
      fireEvent.click(await enabled("Token anlegen …"));
      fireEvent.change(screen.getByLabelText("Name"), {
        target: { value: name },
      });
      fireEvent.change(screen.getByLabelText("Größe"), {
        target: { value: size },
      });
      fireEvent.click(screen.getByRole("button", { name: "Anlegen" }));
    };
    await create("Goblin 1", "medium");
    // The 1000 × 500 map has 10 × 5 cells of 100 px: the middle cell is (4, 2).
    await waitFor(() => {
      expect(maps.view.setTokens.mock.lastCall?.[0]).toEqual([
        {
          id: "new-1",
          name: "Goblin 1",
          x: 400,
          y: 200,
          width: 100,
          height: 100,
        },
      ]);
    });
    await waitFor(() => {
      expect(library.fs.files().get("campaigns/mine/scenes/s.json")).toContain(
        "Goblin 1",
      );
    });

    // A second one goes next to it, never on the same cell.
    await create("Oger", "large");
    await waitFor(() => {
      expect(maps.view.setTokens.mock.lastCall?.[0]).toHaveLength(2);
    });
    const [first, second] = maps.view.setTokens.mock.lastCall?.[0] ?? [];
    if (!first || !second) throw new Error("two tokens expected");
    // Their footprints never overlap (the Large one's first choice would cover the Goblin).
    const apart =
      second.x >= first.x + first.width ||
      first.x >= second.x + second.width ||
      second.y >= first.y + first.height ||
      first.y >= second.y + second.height;
    expect(apart).toBe(true);

    fireEvent.keyDown(window, { key: "z", ctrlKey: true });
    await waitFor(() => {
      expect(maps.view.setTokens.mock.lastCall?.[0]).toHaveLength(1);
    });
  });

  test("the DM selects tokens on the map, moves them as one step, hides them on the TV and deletes them (T-107b)", async () => {
    const twoTokens: Scene = {
      ...mapped,
      tokens: [
        {
          id: "goblin",
          name: "Goblin",
          size: "medium",
          position: { col: 1, row: 1 },
          levelId: "ground",
        },
        {
          id: "ogre",
          name: "Oger",
          size: "large",
          position: { col: 8, row: 3 },
          levelId: "ground",
        },
      ],
    };
    const { tv, library, maps } = renderScene(
      { "campaigns/mine/campaign.json": campaign },
      twoTokens,
    );
    const saved = () =>
      (
        JSON.parse(
          library.fs.files().get("campaigns/mine/scenes/s.json") ?? "{}",
        ) as Scene
      ).tokens;
    // The players see tokens in revealed fog only.
    fireEvent.click(await enabled("Alles aufdecken"));
    await waitFor(() => {
      expect(tv.shown.at(-1)?.tokens).toHaveLength(2);
    });
    // The 1000 × 500 map fills the 1000 × 500 view: screen pixels are map pixels.
    const map = screen.getByRole("application", { name: /Höhle/ });
    fireEvent.pointerDown(map, { clientX: 150, clientY: 150, pointerId: 1 });
    fireEvent.pointerUp(map, { clientX: 150, clientY: 150, pointerId: 1 });
    fireEvent.pointerDown(map, {
      clientX: 900,
      clientY: 400,
      pointerId: 1,
      shiftKey: true,
    });
    fireEvent.pointerUp(map, { clientX: 900, clientY: 400, pointerId: 1 });
    await waitFor(() => {
      expect(
        maps.view.setTokens.mock.lastCall?.[0].map((token) => token.selected),
      ).toEqual([true, true]);
    });

    // The Ogre stands at the right edge: the group stops there, keeping its formation.
    fireEvent.keyDown(map, { key: "ArrowRight" });
    fireEvent.keyDown(map, { key: "ArrowUp" });
    await waitFor(() => {
      expect(saved().map((token) => token.position)).toEqual([
        { col: 1, row: 0 },
        { col: 8, row: 2 },
      ]);
    });
    // One step per move, for the whole group.
    fireEvent.keyDown(window, { key: "z", ctrlKey: true });
    await waitFor(() => {
      expect(saved().map((token) => token.position)).toEqual([
        { col: 1, row: 1 },
        { col: 8, row: 3 },
      ]);
    });

    fireEvent.click(await enabled("Auf dem TV verbergen"));
    await waitFor(() => {
      expect(tv.shown.at(-1)?.tokens).toEqual([]);
    });
    expect(
      maps.view.setTokens.mock.lastCall?.[0].map((token) => token.hidden),
    ).toEqual([true, true]);
    expect(
      screen
        .getByRole("button", { name: "Auf dem TV verbergen" })
        .getAttribute("aria-pressed"),
    ).toBe("true");

    fireEvent.click(screen.getByRole("button", { name: "Löschen" }));
    await waitFor(() => {
      expect(saved()).toEqual([]);
    });
    expect(maps.view.setTokens.mock.lastCall?.[0]).toEqual([]);
  });

  test("a campaign that hides tokens by default: they show faded, and showing one sets it visible (T-107b)", async () => {
    const hiding = JSON.stringify({
      ...(JSON.parse(campaign) as object),
      visibilityDefaults: { token: "hidden" },
    });
    const oneToken: Scene = {
      ...mapped,
      tokens: [
        {
          id: "goblin",
          name: "Goblin",
          size: "medium",
          position: { col: 1, row: 1 },
          levelId: "ground",
        },
      ],
    };
    const { tv, library, maps } = renderScene(
      { "campaigns/mine/campaign.json": hiding },
      oneToken,
    );
    fireEvent.click(await enabled("Alles aufdecken"));
    await waitFor(() => {
      expect(maps.view.setTokens.mock.lastCall?.[0][0]?.hidden).toBe(true);
    });
    const map = screen.getByRole("application", { name: /Höhle/ });
    fireEvent.pointerDown(map, { clientX: 150, clientY: 150, pointerId: 1 });
    fireEvent.pointerUp(map, { clientX: 150, clientY: 150, pointerId: 1 });
    const hide = await enabled("Auf dem TV verbergen");
    expect(hide.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(hide);
    await waitFor(() => {
      expect(tv.shown.at(-1)?.tokens).toHaveLength(1);
    });
    await waitFor(() => {
      expect(library.fs.files().get("campaigns/mine/scenes/s.json")).toContain(
        '"visible"',
      );
    });
  });

  test("the combat switch snaps tokens onto cells, gliding, and one undo brings them back (T-233b)", async () => {
    const free: Scene = {
      ...mapped,
      tokens: [
        {
          id: "goblin",
          name: "Goblin",
          size: "medium",
          position: { col: 3.4, row: 2.3 },
          levelId: "ground",
        },
      ],
    };
    const { tv, maps } = renderScene(
      { "campaigns/mine/campaign.json": campaign },
      free,
    );
    const combat = await enabled("Kampf");
    fireEvent.click(combat);
    await waitFor(() => {
      expect(maps.view.setTokens.mock.lastCall?.[0][0]).toMatchObject({
        x: 300,
        y: 200,
      });
    });
    // The snap glides into place.
    expect(maps.view.setTokens.mock.lastCall?.[1]).toEqual({ glide: 250 });
    expect(combat.getAttribute("aria-pressed")).toBe("true");
    expect(tv.shown.at(-1)?.combat).toBe(true);

    fireEvent.keyDown(window, { key: "z", ctrlKey: true });
    await waitFor(() => {
      const back = maps.view.setTokens.mock.lastCall?.[0][0];
      expect(back?.x).toBeCloseTo(340);
      expect(back?.y).toBeCloseTo(230);
    });
    expect(tv.shown.at(-1)?.combat).toBeUndefined();
  });

  test("a combat that finds no room for every token does not start (T-233b)", async () => {
    // The 1000 × 500 map has 10 × 5 cells: 51 tokens cannot all have one.
    const crowded: Scene = {
      ...mapped,
      tokens: Array.from({ length: 51 }, (_, index) => ({
        id: `goblin-${String(index)}`,
        name: "Goblin",
        size: "medium" as const,
        position: { col: 0, row: 0 },
        levelId: "ground",
      })),
    };
    renderScene({ "campaigns/mine/campaign.json": campaign }, crowded);
    fireEvent.click(await enabled("Kampf"));
    expect(
      await screen.findByText(
        "Nicht jedes Token findet ein freies Feld: der Kampf beginnt nicht.",
      ),
    ).toBeDefined();
    expect(
      screen
        .getByRole("button", { name: "Kampf" })
        .getAttribute("aria-pressed"),
    ).toBe("false");
  });

  test("a token moved onto another goes to the nearest free cell (T-233c)", async () => {
    const two: Scene = {
      ...mapped,
      tokens: [
        {
          id: "goblin",
          name: "Goblin",
          size: "medium",
          position: { col: 1, row: 1 },
          levelId: "ground",
        },
        {
          id: "aria",
          name: "Aria",
          size: "medium",
          position: { col: 3, row: 1 },
          levelId: "ground",
        },
      ],
    };
    const { library } = renderScene(
      { "campaigns/mine/campaign.json": campaign },
      two,
    );
    const map = await screen.findByRole("application", { name: /Höhle/ });
    await enabled("Alles aufdecken");
    // The Goblin dragged two cells right, onto Aria (screen pixels are map pixels).
    fireEvent.pointerDown(map, { clientX: 150, clientY: 150, pointerId: 1 });
    fireEvent.pointerMove(map, { clientX: 250, clientY: 150, pointerId: 1 });
    fireEvent.pointerMove(map, { clientX: 350, clientY: 150, pointerId: 1 });
    fireEvent.pointerUp(map, { clientX: 350, clientY: 150, pointerId: 1 });
    await waitFor(() => {
      const saved = (
        JSON.parse(
          library.fs.files().get("campaigns/mine/scenes/s.json") ?? "{}",
        ) as Scene
      ).tokens;
      const goblin = saved[0]?.position;
      expect(goblin).toBeDefined();
      expect(goblin).not.toEqual({ col: 3, row: 1 });
      expect(
        Math.max(
          Math.abs((goblin?.col ?? 0) - 3),
          Math.abs((goblin?.row ?? 0) - 1),
        ),
      ).toBe(1);
    });
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
