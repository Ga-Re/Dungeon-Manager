import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { describe, expect, test } from "vitest";
import { createI18n } from "@dungeon-manager/ui";
import type { MemoryFileContent } from "@dungeon-manager/storage";
import { fakeLibraryService } from "./fake-library.test-data.js";
import { LibraryPanel } from "./LibraryPanel.js";
import { memoryStorage } from "./memory-storage.test-data.js";
import { readRecent, type RecentCampaign } from "./recent-campaigns.js";

const campaignFile = (id: string, name: string) =>
  JSON.stringify({
    schemaVersion: 1,
    id,
    name,
    players: [],
    visibilityDefaults: {},
  });

const sceneFile = (id: string, name: string) =>
  JSON.stringify({
    schemaVersion: 1,
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
) {
  let next = 0;
  return render(
    <I18nextProvider i18n={createI18n("de")}>
      <LibraryPanel
        service={library.service}
        newId={() => `id-${String(++next)}`}
        welcome
        storage={storage}
        now={() => NOW}
      />
    </I18nextProvider>,
  );
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
    expect(document.activeElement).toBe(choose);

    fireEvent.click(choose);
    const field = await within(dialog()).findByRole("textbox", {
      name: "Name der neuen Kampagne",
    });
    expect(
      within(dialog()).getByRole("heading", { name: "Erste Kampagne anlegen" }),
    ).toBeTruthy();
    expect(document.activeElement).toBe(field);

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
    expect(document.activeElement).toBe(mine);
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
    expect(document.activeElement).toBe(
      within(dialog()).getByRole("heading", { name: "Zuletzt bearbeitet" }),
    );
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
    expect(document.activeElement).toBe(
      within(dialog()).getByRole("heading", { name: "Andere Kampagne öffnen" }),
    );
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
});
