import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { describe, expect, test, vi } from "vitest";
import { createI18n } from "@dungeon-manager/ui";
import type { MemoryFileContent } from "@dungeon-manager/storage";
import { fakeLibraryService } from "./fake-library.test-data.js";
import { LibraryPanel } from "./LibraryPanel.js";
import { memoryStorage } from "./memory-storage.test-data.js";
import { readRecent, type RecentCampaign } from "./recent-campaigns.js";
import type { ViewerScene } from "@dungeon-manager/schema";
import type { PlayerFeedSender } from "../platform/player-feed.js";
import { PlayerFeedContext } from "./player-feed-context.js";

const campaignFile = (id: string, name: string) =>
  JSON.stringify({
    schemaVersion: 2,
    id,
    name,
    players: [],
    visibilityDefaults: {},
  });

const sceneFile = (id: string, name: string) =>
  JSON.stringify({
    schemaVersion: 2,
    id,
    name,
    map: null,
    tokens: [],
    fog: { levels: {} },
    initiative: null,
  });

const LIBRARY: Record<string, MemoryFileContent> = {
  "campaigns/mine/campaign.json": campaignFile("c1", "Die verlorene Mine"),
  "campaigns/mine/scenes/a.json": sceneFile("a", "Eingang"),
  "campaigns/mine/scenes/b.json": sceneFile("b", "Zwergenhalle"),
  "campaigns/krypta/campaign.json": campaignFile("c2", "Fluch der Krypta"),
};

const NOW = new Date(Date.UTC(2026, 10, 19, 12));

const recentEntry = (
  slug: string,
  name: string,
  scene?: [string, string],
): RecentCampaign => ({
  root: "/lib",
  slug,
  name,
  sceneId: scene?.[0] ?? null,
  sceneName: scene?.[1] ?? null,
  openedAt: NOW.toISOString(),
});

function renderWelcome(
  library: ReturnType<typeof fakeLibraryService>,
  storage: Storage,
  afterCrash = false,
) {
  let next = 0;
  const shown: (ViewerScene | null)[] = [];
  const feed: PlayerFeedSender = {
    show: vi.fn((scene: ViewerScene | null) => {
      shown.push(scene);
    }),
    rotate: vi.fn(),
    rotation: 0,
    calibrate: vi.fn(),
    showCheckSquare: vi.fn(),
  };
  render(
    <I18nextProvider i18n={createI18n("de")}>
      <PlayerFeedContext value={feed}>
        <LibraryPanel
          service={library.service}
          newId={() => `id-${String(++next)}`}
          welcome
          storage={storage}
          now={() => NOW}
          afterCrash={afterCrash}
        />
      </PlayerFeedContext>
    </I18nextProvider>,
  );
  /** The scene the TV shows (`null`: dark). */
  return { onTv: () => shown.at(-1)?.name ?? null };
}

const dialog = () => screen.getByRole("dialog", { name: "Willkommen" });

describe("WelcomeDialog", () => {
  test("on the very first start it asks for the folder, then for the first campaign", async () => {
    const library = fakeLibraryService(null);
    library.service.chooseRoot.mockImplementation(() => {
      library.setRoot("/lib");
      return Promise.resolve("/lib");
    });
    const storage = memoryStorage();
    renderWelcome(library, storage);

    const choose = await within(dialog()).findByRole("button", {
      name: "Bibliotheksordner wählen …",
    });
    expect(
      within(dialog()).getByRole("heading", {
        name: "Willkommen beim Dungeon Manager",
      }),
    ).toBeTruthy();
    // Focus moves in an effect after the step appears (T-169: never checked synchronously).
    await waitFor(() => {
      expect(document.activeElement).toBe(choose);
    });

    fireEvent.click(choose);
    const field = await within(dialog()).findByRole("textbox", {
      name: "Name der neuen Kampagne",
    });
    expect(
      within(dialog()).getByRole("heading", { name: "Erste Kampagne anlegen" }),
    ).toBeTruthy();
    await waitFor(() => {
      expect(document.activeElement).toBe(field);
    });

    fireEvent.change(field, { target: { value: "Neue Welt" } });
    fireEvent.click(
      within(dialog()).getByRole("button", { name: "Kampagne anlegen" }),
    );

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });
    expect(
      await screen.findByRole("treeitem", { name: "Neue Welt" }),
    ).toBeTruthy();
    await waitFor(() => {
      expect(readRecent(storage).map((each) => each.name)).toEqual([
        "Neue Welt",
      ]);
    });
  });

  test("lists recent campaigns and opens one with its last scene", async () => {
    const library = fakeLibraryService("/lib", LIBRARY);
    const storage = memoryStorage({
      "dm.recentCampaigns": JSON.stringify([
        recentEntry("mine", "Die verlorene Mine", ["b", "Zwergenhalle"]),
        recentEntry("gone", "Alte Kampagne"),
      ]),
    });
    renderWelcome(library, storage);

    const recent = await within(dialog()).findByRole("list", {
      name: "Zuletzt bearbeitet",
    });
    const mine = within(recent).getByRole("button", {
      name: /Die verlorene Mine/,
    });
    expect(mine.textContent).toMatch(/Zwergenhalle · 19\. Nov\. 2026/);
    // Focus moves once the library is read (an effect after the list appears).
    await waitFor(() => {
      expect(document.activeElement).toBe(mine);
    });
    expect(
      within(recent).getByText("Nicht mehr in dieser Bibliothek"),
    ).toBeTruthy();

    fireEvent.click(mine);

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(
      await screen.findByText("Geöffnete Szene: Zwergenhalle"),
    ).toBeTruthy();
  });

  test("a missing campaign can be removed from the list", async () => {
    const library = fakeLibraryService("/lib", LIBRARY);
    const storage = memoryStorage({
      "dm.recentCampaigns": JSON.stringify([
        recentEntry("mine", "Die verlorene Mine"),
        recentEntry("gone", "Alte Kampagne"),
      ]),
    });
    renderWelcome(library, storage);

    fireEvent.click(
      await within(dialog()).findByRole("button", {
        name: "„Alte Kampagne“ aus der Liste entfernen",
      }),
    );

    expect(within(dialog()).queryByText("Alte Kampagne")).toBeNull();
    await waitFor(() => {
      expect(document.activeElement).toBe(
        within(dialog()).getByRole("heading", { name: "Zuletzt bearbeitet" }),
      );
    });
    expect(readRecent(storage).map((each) => each.slug)).toEqual(["mine"]);
  });

  test("opens another campaign and remembers the scene opened in it", async () => {
    const library = fakeLibraryService("/lib", LIBRARY);
    const storage = memoryStorage({
      "dm.recentCampaigns": JSON.stringify([
        recentEntry("krypta", "Fluch der Krypta"),
      ]),
    });
    renderWelcome(library, storage);

    const other = await within(dialog()).findByRole("button", {
      name: "Andere Kampagne öffnen …",
    });
    fireEvent.click(other);
    await waitFor(() => {
      expect(document.activeElement).toBe(
        within(dialog()).getByRole("heading", {
          name: "Andere Kampagne öffnen",
        }),
      );
    });
    fireEvent.click(
      within(dialog()).getByRole("button", { name: "Die verlorene Mine" }),
    );

    fireEvent.click(await screen.findByRole("treeitem", { name: "Eingang" }));
    expect(await screen.findByText("Geöffnete Szene: Eingang")).toBeTruthy();
    await waitFor(() => {
      expect(readRecent(storage)[0]).toMatchObject({
        slug: "mine",
        sceneId: "a",
        sceneName: "Eingang",
      });
    });
  });

  test("without recent campaigns it lists the library's campaigns", async () => {
    renderWelcome(fakeLibraryService("/lib", LIBRARY), memoryStorage());

    const list = await within(dialog()).findByRole("list", {
      name: "Kampagnen in dieser Bibliothek",
    });
    expect(
      within(list)
        .getAllByRole("button")
        .map((each) => each.textContent),
    ).toEqual(["Fluch der Krypta", "Die verlorene Mine"]);
    expect(
      within(dialog()).queryByRole("button", {
        name: "Andere Kampagne öffnen …",
      }),
    ).toBeNull();
  });

  test("Escape closes it into the empty window", async () => {
    renderWelcome(fakeLibraryService("/lib", LIBRARY), memoryStorage());
    await within(dialog()).findByRole("list");

    fireEvent.keyDown(document.activeElement ?? dialog(), { key: "Escape" });

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByText("Wähle eine Kampagne:")).toBeTruthy();
    expect(screen.queryByText(/Geöffnete Szene/)).toBeNull();
  });

  describe("the campaign's scene tabs come back (T-114a)", () => {
    const remembered = (): Storage =>
      memoryStorage({
        "dm.recentCampaigns": JSON.stringify([
          {
            ...recentEntry("mine", "Die verlorene Mine", ["a", "Eingang"]),
            openSceneIds: ["a", "b"],
            activeSceneId: "b",
          },
        ]),
      });
    const tabNames = () =>
      within(screen.getByRole("group", { name: "Offene Szenen" }))
        .getAllByRole("button")
        .filter((each) => each.classList.contains("dm-scene-tab-name"))
        .map((each) => each.textContent);

    test("with the TV's scene back on the TV after a clean end", async () => {
      const storage = remembered();
      const { onTv } = renderWelcome(
        fakeLibraryService("/lib", LIBRARY),
        storage,
      );
      fireEvent.click(
        await within(dialog()).findByRole("button", {
          name: /Die verlorene Mine/,
        }),
      );
      expect(
        await screen.findByText("Geöffnete Szene: Zwergenhalle"),
      ).toBeTruthy();
      expect(tabNames()).toEqual(["Eingang(auf dem TV)", "Zwergenhalle"]);
      await waitFor(() => {
        expect(onTv()).toBe("Eingang");
      });
      // Another scene sent to the TV is what the next start puts there.
      fireEvent.click(screen.getByRole("button", { name: "Szene auf den TV" }));
      await waitFor(() => {
        expect(readRecent(storage)[0]).toMatchObject({ tvSceneId: "b" });
      });
    });

    test("with the TV dark after a crash, until the DM sends a scene", async () => {
      const storage = remembered();
      const { onTv } = renderWelcome(
        fakeLibraryService("/lib", LIBRARY),
        storage,
        true,
      );
      fireEvent.click(
        await within(dialog()).findByRole("button", {
          name: /Die verlorene Mine/,
        }),
      );
      expect(
        await screen.findByText("Geöffnete Szene: Zwergenhalle"),
      ).toBeTruthy();
      expect(tabNames()).toEqual(["Eingang", "Zwergenhalle"]);
      expect(onTv()).toBeNull();
      // Closing a tab is remembered for the next start.
      fireEvent.click(
        screen.getByRole("button", { name: "Eingang schließen" }),
      );
      await waitFor(() => {
        expect(readRecent(storage)[0]).toMatchObject({
          openSceneIds: ["b"],
          activeSceneId: "b",
          tvSceneId: null,
        });
      });

      // A clean end with the TV still dark: the next start keeps it dark.
      cleanup();
      const next = renderWelcome(fakeLibraryService("/lib", LIBRARY), storage);
      fireEvent.click(
        await within(dialog()).findByRole("button", {
          name: /Die verlorene Mine/,
        }),
      );
      expect(
        await screen.findByText("Geöffnete Szene: Zwergenhalle"),
      ).toBeTruthy();
      expect(next.onTv()).toBeNull();
    });
  });

  describe("rescue copies of scenes whose save failed (T-114b)", () => {
    const rescued = () =>
      memoryStorage({
        "dm.recentCampaigns": JSON.stringify([
          recentEntry("mine", "Die verlorene Mine"),
        ]),
        "dm.rescueCopies": JSON.stringify({
          version: 1,
          copies: [
            {
              root: "/lib",
              slug: "mine",
              savedAt: "2026-11-19T11:00:00.000Z",
              // As kept by the app: the current scene version.
              scene: {
                ...(JSON.parse(sceneFile("a", "Eingang (neu)")) as object),
                schemaVersion: 3,
              },
            },
          ],
        }),
      });
    const openMine = async () => {
      fireEvent.click(
        await within(dialog()).findByRole("button", {
          name: /Die verlorene Mine/,
        }),
      );
    };

    test("are offered with their campaign; restoring writes them to the library", async () => {
      const storage = rescued();
      const library = fakeLibraryService("/lib", LIBRARY);
      renderWelcome(library, storage);
      await openMine();
      const restore = await screen.findByRole("button", {
        name: "Änderungen an Eingang (neu) wiederherstellen",
      });
      fireEvent.click(restore);
      expect(
        await screen.findByText(
          "Änderungen an Eingang (neu) wiederhergestellt",
        ),
      ).toBeTruthy();
      expect(library.fs.files().get("campaigns/mine/scenes/a.json")).toContain(
        "Eingang (neu)",
      );
      expect(storage.getItem("dm.rescueCopies")).not.toContain("Eingang");
      expect(
        screen.queryByRole("button", {
          name: "Änderungen an Eingang (neu) wiederherstellen",
        }),
      ).toBeNull();
    });

    test("discarding drops the copy and leaves the library as it is", async () => {
      const storage = rescued();
      const library = fakeLibraryService("/lib", LIBRARY);
      renderWelcome(library, storage);
      await openMine();
      fireEvent.click(
        await screen.findByRole("button", {
          name: "Änderungen an Eingang (neu) verwerfen",
        }),
      );
      expect(
        await screen.findByText("Änderungen an Eingang (neu) verworfen"),
      ).toBeTruthy();
      expect(
        library.fs.files().get("campaigns/mine/scenes/a.json"),
      ).not.toContain("Eingang (neu)");
      expect(storage.getItem("dm.rescueCopies")).not.toContain("Eingang");
    });
  });
});
