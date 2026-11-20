// The level switcher (T-118c): the DM works on any level and shows it on the TV separately.
import type { MapImage } from "@dungeon-manager/renderer";
import type { Level, Scene, ViewerScene } from "@dungeon-manager/schema";
import { createI18n } from "@dungeon-manager/ui";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { fakeMapService } from "../fake-renderer.test-data.js";
import type { PlayerFeedSender } from "../platform/player-feed.js";
import { fakeLibraryService } from "./fake-library.test-data.js";
import { MapViewContext } from "./MapView.js";
import { OpenScenePanel } from "./OpenScenePanel.js";
import { PlayerFeedContext } from "./player-feed-context.js";
import { RELOAD_DELAY_MS } from "./useLibraryChanges.js";

const campaign = JSON.stringify({
  schemaVersion: 2,
  id: "c",
  name: "Mine",
  players: [],
  visibilityDefaults: {},
});

const hash = `sha256:${"a".repeat(64)}`;

/** A tower: the ground floor shows the map's image, the cellar its own. */
const towerLevels: readonly Level[] = [
  { id: "ground", name: "Erdgeschoss" },
  {
    id: "cellar",
    name: "Keller",
    asset: { path: "library/maps/keller.png", hash },
  },
];

const tower: Scene = {
  schemaVersion: 3,
  id: "s",
  name: "Turm",
  map: {
    kind: "image",
    asset: { path: "library/maps/turm.png", hash },
    overrides: {},
  },
  tokens: [],
  fog: { levels: {} },
  initiative: null,
};

/** The tower's sidecar: grid and levels belong to the map (ADR-0012). */
const sidecarOf = (levels: readonly Level[]) =>
  JSON.stringify({
    schemaVersion: 1,
    original: { hash },
    map: {
      grid: { cellSizePx: 100, offsetXPx: 0, offsetYPx: 0 },
      levels,
      rooms: [],
    },
  });

function renderScene(opened: Scene, levels: readonly Level[] = towerLevels) {
  const library = fakeLibraryService("/lib", {
    "campaigns/mine/campaign.json": campaign,
    "library/maps/turm.png.dm.json": sidecarOf(levels),
  });
  const shown: (ViewerScene | null)[] = [];
  const feed: PlayerFeedSender = {
    show: vi.fn((next: ViewerScene | null) => {
      shown.push(next);
    }),
    rotate: vi.fn(),
    rotation: 0,
    calibrate: vi.fn(),
    showCheckSquare: vi.fn(),
  };
  // The cellar's own image has another size than the tower's map.
  const maps = fakeMapService((path) =>
    Promise.resolve(
      (path.endsWith("keller.png")
        ? { width: 800, height: 600 }
        : { width: 1000, height: 500 }) as unknown as MapImage,
    ),
  );
  render(
    <I18nextProvider i18n={createI18n("de")}>
      <PlayerFeedContext value={feed}>
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
    </I18nextProvider>,
  );
  const saved = () =>
    JSON.parse(
      library.fs.files().get("campaigns/mine/scenes/s.json") ?? "{}",
    ) as Scene;
  const sidecar = () =>
    JSON.parse(
      library.fs.files().get("library/maps/turm.png.dm.json") ?? "{}",
    ) as { map: { levels: Level[] } };
  return { shown, maps, saved, library, sidecar };
}

// The map view only loads with a size; jsdom lays nothing out.
const box = {
  width: Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientWidth"),
  height: Object.getOwnPropertyDescriptor(
    HTMLElement.prototype,
    "clientHeight",
  ),
};
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

const showOnTv = () => screen.getByRole("button", { name: "Auf TV zeigen" });

describe("level switcher", () => {
  test("is hidden while the map has one level", async () => {
    renderScene(tower, towerLevels.slice(0, 1));
    await screen.findByRole("button", { name: "Alles aufdecken" });
    expect(screen.queryByRole("button", { name: "Auf TV zeigen" })).toBeNull();
  });

  test("the DM prepares a level in secret, then shows it on the TV", async () => {
    const { shown, maps, saved } = renderScene(tower);
    // Working on the TV's level: nothing to show.
    expect(
      await screen.findByRole("button", { name: "Erdgeschoss" }),
    ).toBeTruthy();
    expect(showOnTv()).toHaveProperty("disabled", true);
    expect(screen.getByText("Auf dem TV: Erdgeschoss")).toBeTruthy();

    // Pick the cellar: its own image, its fog – the TV stays on the ground floor.
    fireEvent.click(screen.getByRole("button", { name: "Erdgeschoss" }));
    fireEvent.click(screen.getByRole("menuitemradio", { name: "Keller" }));
    await waitFor(() => {
      expect(maps.service.loadImage).toHaveBeenLastCalledWith(
        "library/maps/keller.png",
      );
    });
    const revealAll = screen.getByRole("button", { name: "Alles aufdecken" });
    await waitFor(() => {
      expect(revealAll).toHaveProperty("disabled", false);
    });
    fireEvent.click(revealAll);
    await waitFor(() => {
      expect(saved().fog.levels["cellar"]?.revealed).toHaveLength(1);
    });
    // "Reveal all" covers the cellar's own image, not the tower's map.
    expect(
      Math.max(
        ...(saved().fog.levels["cellar"]?.revealed[0]?.outer.map(([x]) => x) ??
          []),
      ),
    ).toBe(800);
    expect(shown.at(-1)?.map?.currentLevelId).toBe("ground");
    expect(JSON.stringify(shown)).not.toContain("Keller");

    // Show it: the TV switches, the cellar is released, the ground floor stays released.
    fireEvent.click(showOnTv());
    expect(shown.at(-1)?.map?.currentLevelId).toBe("cellar");
    expect(shown.at(-1)?.fog["cellar"]?.revealed).toHaveLength(1);
    expect(screen.getByText("Auf dem TV: Keller")).toBeTruthy();
    expect(showOnTv()).toHaveProperty("disabled", true);
    await waitFor(() => {
      expect(saved().table).toEqual({
        levelId: "cellar",
        shownLevelIds: ["ground", "cellar"],
      });
    });

    // Undo puts the TV back on the ground floor.
    fireEvent.keyDown(window, { key: "z", ctrlKey: true });
    expect(shown.at(-1)?.map?.currentLevelId).toBe("ground");

    // Back to the ground floor: the tower's map again, at its size.
    fireEvent.click(screen.getByRole("button", { name: "Keller" }));
    fireEvent.click(screen.getByRole("menuitemradio", { name: "Erdgeschoss" }));
    await waitFor(() => {
      expect(maps.service.loadImage).toHaveBeenLastCalledWith(
        "library/maps/turm.png",
      );
    });
    await waitFor(() => {
      expect(revealAll).toHaveProperty("disabled", false);
    });
    fireEvent.click(revealAll);
    await waitFor(() => {
      expect(
        Math.max(
          ...(saved().fog.levels["ground"]?.revealed[0]?.outer.map(
            ([x]) => x,
          ) ?? []),
        ),
      ).toBe(1000);
    });
  });
});

describe("adding and renaming levels (T-118d)", () => {
  const openLevelMenu = async (item: string) => {
    fireEvent.click(await screen.findByRole("button", { name: "Ebene" }));
    fireEvent.click(screen.getByRole("menuitem", { name: item }));
  };
  const mapLoaded = async () => {
    const revealAll = await screen.findByRole("button", {
      name: "Alles aufdecken",
    });
    await waitFor(() => {
      expect(revealAll).toHaveProperty("disabled", false);
    });
  };

  test("a map with one level gets a second one; the DM works on it, the TV stays", async () => {
    const { sidecar, shown, library } = renderScene(
      tower,
      towerLevels.slice(0, 1),
    );
    await mapLoaded();
    expect(screen.queryByRole("button", { name: "Auf TV zeigen" })).toBeNull();
    await openLevelMenu("Ebene hinzufügen …");
    expect(
      screen.getByText("Ohne eigene Datei zeigt die Ebene das Bild der Karte."),
    ).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Name der Ebene"), {
      target: { value: " Dachboden " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Ebene anlegen" }));
    await waitFor(() => {
      expect(sidecar().map.levels).toEqual([
        { id: "ground", name: "Erdgeschoss" },
        { id: "new-level", name: "Dachboden" },
      ]);
    });
    expect(
      await screen.findByRole("button", { name: "Dachboden" }),
    ).toBeTruthy();
    expect(shown.at(-1)?.map?.currentLevelId).toBe("ground");
    expect(JSON.stringify(shown)).not.toContain("Dachboden");
    // Our own write coming back from the watcher is no change from elsewhere.
    library.emit(["library/maps/turm.png.dm.json"]);
    await new Promise((resolve) => setTimeout(resolve, RELOAD_DELAY_MS + 100));
    expect(screen.queryByText(/wurden geändert/)).toBeNull();
  });

  test("a level's own file must have the map's size", async () => {
    const { sidecar, library } = renderScene(tower, towerLevels.slice(0, 1));
    await mapLoaded();
    await openLevelMenu("Ebene hinzufügen …");
    library.service.importMap.mockResolvedValueOnce({
      path: "library/maps/keller.png",
      hash,
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Eigenes Bild oder Video wählen …" }),
    );
    expect(
      await screen.findByText(
        /keller\.png ist 800 × 600 Pixel groß, die Karte 1000 × 500/,
      ),
    ).toBeTruthy();
    // A video level is measured as a video.
    library.service.importMap.mockResolvedValueOnce({
      path: "library/maps/fluss.mp4",
      hash,
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Eigenes Bild oder Video wählen …" }),
    );
    expect(
      await screen.findByText(/fluss\.mp4 ist 320 × 200 Pixel groß/),
    ).toBeTruthy();
    library.service.importMap.mockResolvedValueOnce({
      path: "library/maps/gruft.png",
      hash,
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Eigenes Bild oder Video wählen …" }),
    );
    expect(await screen.findByText("Eigene Datei: gruft.png")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Name der Ebene"), {
      target: { value: "Gruft" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Ebene anlegen" }));
    await waitFor(() => {
      expect(sidecar().map.levels.at(-1)).toEqual({
        id: "new-level",
        name: "Gruft",
        asset: { path: "library/maps/gruft.png", hash },
      });
    });
  });

  test("a new name reaches the TV only for levels the players have seen", async () => {
    const { sidecar, shown } = renderScene(tower);
    await mapLoaded();
    await openLevelMenu("Ebene umbenennen …");
    const name = screen.getByLabelText("Name der Ebene");
    expect(name).toHaveProperty("value", "Erdgeschoss");
    fireEvent.change(name, { target: { value: "Hof" } });
    fireEvent.click(screen.getByRole("button", { name: "Umbenennen" }));
    await waitFor(() => {
      expect(shown.at(-1)?.map?.levels).toEqual([
        { id: "ground", name: "Hof" },
      ]);
    });

    // The cellar is not shown yet: its new name stays on the DM's side.
    fireEvent.click(screen.getByRole("button", { name: "Hof" }));
    fireEvent.click(screen.getByRole("menuitemradio", { name: "Keller" }));
    await openLevelMenu("Ebene umbenennen …");
    fireEvent.change(screen.getByLabelText("Name der Ebene"), {
      target: { value: "Geheimgang" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Umbenennen" }));
    await waitFor(() => {
      expect(sidecar().map.levels[1]?.name).toBe("Geheimgang");
    });
    expect(JSON.stringify(shown)).not.toContain("Geheimgang");
  });
});
