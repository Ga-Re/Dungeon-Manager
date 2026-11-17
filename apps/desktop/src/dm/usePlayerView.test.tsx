import type { Scene, ViewerScene } from "@dungeon-manager/schema";
import { render, screen, waitFor } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { describe, expect, test, vi } from "vitest";
import { createI18n } from "../i18n.js";
import type { PlayerFeedSender } from "../platform/player-feed.js";
import { fakeLibraryService } from "./fake-library.test-data.js";
import { OpenScenePanel } from "./OpenScenePanel.js";
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

function renderScene(files: Record<string, string>) {
  const library = fakeLibraryService("/lib", files);
  const tv = fakeFeed();
  const result = render(
    <I18nextProvider i18n={createI18n("de")}>
      <PlayerFeedContext value={tv.feed}>
        <OpenScenePanel
          service={library.service}
          slug="mine"
          scene={scene}
          newId={() => "id"}
          onChanged={() => undefined}
          onDeleted={() => undefined}
          onClose={() => undefined}
        />
      </PlayerFeedContext>
    </I18nextProvider>,
  );
  return { tv, ...result };
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
