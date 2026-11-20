// The level switcher (T-118c): the DM works on any level and shows it on the TV separately.
import type { MapImage } from "@dungeon-manager/renderer";
import type { Scene, ViewerScene } from "@dungeon-manager/schema";
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

const campaign = JSON.stringify({
  schemaVersion: 1,
  id: "c",
  name: "Mine",
  players: [],
  visibilityDefaults: {},
});

const hash = `sha256:${"a".repeat(64)}`;

/** A tower: the ground floor shows the map's image, the cellar its own. */
const tower: Scene = {
  schemaVersion: 1,
  id: "s",
  name: "Turm",
  map: {
    kind: "image",
    asset: { path: "library/maps/turm.png", hash },
    grid: { cellSizePx: 100, offsetXPx: 0, offsetYPx: 0 },
    levels: [
      { id: "ground", name: "Erdgeschoss" },
      {
        id: "cellar",
        name: "Keller",
        asset: { path: "library/maps/keller.png", hash },
      },
    ],
  },
  tokens: [],
  fog: { levels: {} },
  initiative: null,
};

function renderScene(opened: Scene) {
  const library = fakeLibraryService("/lib", {
    "campaigns/mine/campaign.json": campaign,
  });
  const shown: (ViewerScene | null)[] = [];
  const feed: PlayerFeedSender = {
    show: vi.fn((next: ViewerScene | null) => {
      shown.push(next);
    }),
    rotate: vi.fn(),
    rotation: 0,
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
            newId={() => "id"}
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
  return { shown, maps, saved };
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
    const map = tower.map;
    if (!map) throw new Error("the tower has a map");
    renderScene({ ...tower, map: { ...map, levels: map.levels.slice(0, 1) } });
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
