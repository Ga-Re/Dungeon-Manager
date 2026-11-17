import type { MapImage } from "@dungeon-manager/renderer";
import type { Scene, ViewerScene } from "@dungeon-manager/schema";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { fakeMapService } from "../fake-renderer.test-data.js";
import { createI18n } from "../i18n.js";
import type { PlayerFeedSender } from "../platform/player-feed.js";
import { fakeLibraryService } from "./fake-library.test-data.js";
import { OpenScenePanel } from "./OpenScenePanel.js";
import { MapViewContext } from "./MapView.js";
import { PlayerFeedContext } from "./player-feed-context.js";

const campaign = JSON.stringify({
  schemaVersion: 1,
  id: "c",
  name: "Mine",
  players: [],
  visibilityDefaults: {},
});

// A hidden token: the TV must get the scene without it.
const scene: Scene = {
  schemaVersion: 1,
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
  };
  return { feed, shown };
}

function renderScene(files: Record<string, string>, opened: Scene = scene) {
  const library = fakeLibraryService("/lib", files);
  const tv = fakeFeed();
  const maps = fakeMapService(() =>
    Promise.resolve({ width: 1000, height: 500 } as unknown as MapImage),
  );
  const result = render(
    <I18nextProvider i18n={createI18n("de")}>
      <PlayerFeedContext value={tv.feed}>
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
  return { tv, library, maps, ...result };
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
    map: {
      kind: "image",
      asset: {
        path: "library/maps/hoehle.png",
        hash: `sha256:${"a".repeat(64)}`,
      },
      grid: { cellSizePx: 100, offsetXPx: 0, offsetYPx: 0 },
      levels: [{ id: "ground", name: "Erdgeschoss" }],
    },
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
});
