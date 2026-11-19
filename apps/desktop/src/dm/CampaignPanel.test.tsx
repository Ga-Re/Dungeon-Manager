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
import { LibraryError } from "../platform/library.js";
import { CampaignPanel } from "./CampaignPanel.js";
import { fakeLibraryService } from "./fake-library.test-data.js";
import { RELOAD_DELAY_MS } from "./useLibraryChanges.js";

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

function renderCampaign(library: ReturnType<typeof fakeLibraryService>) {
  let next = 0;
  return render(
    <I18nextProvider i18n={createI18n("de")}>
      <CampaignPanel
        service={library.service}
        slug="mine"
        name="Die verlorene Mine"
        newId={() => `new-${String(++next)}`}
      />
    </I18nextProvider>,
  );
}

/** Names of the scenes in the browser tree (campaign › Szenen › scene). */
const sceneNames = () =>
  within(screen.getByRole("treeitem", { name: "Szenen" }))
    .queryAllByRole("treeitem")
    .filter((item) => item.getAttribute("aria-level") === "3")
    .map((item) => item.querySelector(".dm-tree-label")?.textContent);

/** Clicks a scene in the browser tree, which opens it. */
async function openScene(name: string) {
  fireEvent.click(
    await screen.findByText(name, { selector: ".dm-tree-label" }),
  );
}

/** "Neue Szene …" in the ribbon: the popover with name and map. */
function askForNewScene() {
  fireEvent.click(screen.getByRole("button", { name: "Neue Szene …" }));
  return within(screen.getByRole("group", { name: "Neue Szene …" }));
}

/** "Szene ▾" → "Szene löschen …" in the ribbon. */
function askToDelete() {
  fireEvent.click(screen.getByRole("button", { name: "Szene" }));
  fireEvent.click(screen.getByRole("menuitem", { name: "Szene löschen …" }));
}

describe("CampaignPanel", () => {
  test("lists the scenes by name, including unreadable ones", async () => {
    const library = fakeLibraryService("/lib", {
      "campaigns/mine/scenes/b.json": sceneFile("b", "Zwergenhalle"),
      "campaigns/mine/scenes/a.json": sceneFile("a", "Eingang"),
      "campaigns/mine/scenes/c.json": { placeholder: true },
    });
    renderCampaign(library);
    await waitFor(() => {
      expect(sceneNames()).toEqual([
        "c (noch nicht heruntergeladen)",
        "Eingang",
        "Zwergenhalle",
      ]);
    });
    expect(screen.getByText("Die verlorene Mine")).toBeTruthy();
  });

  test("creates a scene from the ribbon, which opens it, then closes it", async () => {
    const library = fakeLibraryService("/lib");
    renderCampaign(library);
    expect(
      await screen.findByText("Noch keine Szenen in dieser Kampagne."),
    ).toBeTruthy();

    const popover = askForNewScene();
    const field = popover.getByLabelText("Name der neuen Szene");
    expect(document.activeElement).toBe(field);
    fireEvent.change(field, { target: { value: "Eingang" } });
    fireEvent.click(popover.getByRole("button", { name: "Szene anlegen" }));
    expect(await screen.findByText("Geöffnete Szene: Eingang")).toBeTruthy();
    expect(screen.queryByRole("group", { name: "Neue Szene …" })).toBeNull();
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Neue Szene …" }),
    );
    expect(sceneNames()).toEqual(["Eingang"]);
    expect(library.fs.files().has("campaigns/mine/scenes/new-1.json")).toBe(
      true,
    );
    // The open scene shows its content in the tree and is selected.
    expect(
      screen
        .getByRole("treeitem", { name: "Eingang" })
        .getAttribute("aria-selected"),
    ).toBe("true");
    expect(await screen.findByRole("treeitem", { name: "Nebel" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Szene schließen" }));
    expect(screen.queryByText("Geöffnete Szene: Eingang")).toBeNull();
  });

  test("picks up scenes added on disk while the app runs", async () => {
    const library = fakeLibraryService("/lib");
    renderCampaign(library);
    await screen.findByText("Noch keine Szenen in dieser Kampagne.");

    await library.fs.writeAtomic(
      "campaigns/mine/scenes/x.json",
      sceneFile("x", "Neue Szene"),
    );
    // Another campaign's scenes do not concern this panel.
    library.emit(["campaigns/other/scenes/y.json"]);
    await new Promise((resolve) => setTimeout(resolve, RELOAD_DELAY_MS + 100));
    expect(screen.queryByRole("treeitem", { name: "Neue Szene" })).toBeNull();

    library.emit(["campaigns/mine/scenes/x.json"]);
    expect(
      await screen.findByRole("treeitem", { name: "Neue Szene" }),
    ).toBeTruthy();
  });

  test("keeps the typed name and explains when saving fails", async () => {
    const library = fakeLibraryService("/lib");
    library.fs.writeAtomic = () =>
      Promise.reject(new Error("Datenträger voll"));
    renderCampaign(library);
    await screen.findByText("Noch keine Szenen in dieser Kampagne.");
    const popover = askForNewScene();
    const field = popover.getByLabelText<HTMLInputElement>(
      "Name der neuen Szene",
    );
    fireEvent.change(field, { target: { value: "Eingang" } });
    fireEvent.click(popover.getByRole("button", { name: "Szene anlegen" }));
    // Next to the field, in the popover that stays open.
    expect(
      await popover.findByText("Das hat nicht geklappt: Datenträger voll"),
    ).toHaveProperty("role", "alert");
    expect(field.value).toBe("Eingang");
  });

  test("creates a scene with an imported map", async () => {
    const library = fakeLibraryService("/lib");
    const asset = {
      path: "library/maps/hoehle.webp",
      hash: `sha256:${"b".repeat(64)}`,
    };
    library.service.importMap.mockResolvedValue(asset);
    renderCampaign(library);
    await screen.findByText("Noch keine Szenen in dieser Kampagne.");

    const popover = askForNewScene();
    fireEvent.click(popover.getByRole("button", { name: "Karte wählen …" }));
    expect(
      await popover.findByText("Karte für die neue Szene: hoehle.webp"),
    ).toBeTruthy();
    fireEvent.change(popover.getByLabelText("Name der neuen Szene"), {
      target: { value: "Höhle" },
    });
    fireEvent.click(popover.getByRole("button", { name: "Szene anlegen" }));

    expect(await screen.findByText("Karte: hoehle.webp")).toBeTruthy();
    const saved = JSON.parse(
      library.fs.files().get("campaigns/mine/scenes/new-1.json") ?? "{}",
    ) as { map: unknown };
    expect(saved.map).toEqual({
      kind: "image",
      asset,
      grid: { cellSizePx: 100, offsetXPx: 0, offsetYPx: 0 },
      levels: [{ id: "new-2", name: "Erdgeschoss" }],
    });
  });

  test("explains a refused map file", async () => {
    const library = fakeLibraryService("/lib");
    library.service.importMap.mockRejectedValue(
      new LibraryError("unsupportedFile", "/Users/dm/notes.txt"),
    );
    renderCampaign(library);
    await screen.findByText("Noch keine Szenen in dieser Kampagne.");
    fireEvent.click(
      askForNewScene().getByRole("button", { name: "Karte wählen …" }),
    );
    expect(
      await screen.findByText(
        "Diese Datei ist kein PNG-, JPG- oder WebP-Bild und kein MP4- oder WebM-Video.",
      ),
    ).toBeTruthy();
  });

  test("asks what to reset when the map of an open scene changes", async () => {
    const square = {
      outer: [
        [0, 0],
        [10, 0],
        [10, 10],
      ],
      holes: [],
    };
    const library = fakeLibraryService("/lib", {
      "campaigns/mine/scenes/a.json": JSON.stringify({
        ...JSON.parse(sceneFile("a", "Höhle")),
        map: {
          kind: "image",
          asset: {
            path: "library/maps/alt.webp",
            hash: `sha256:${"a".repeat(64)}`,
          },
          grid: { cellSizePx: 70, offsetXPx: 0, offsetYPx: 0 },
          levels: [{ id: "ground", name: "Unten" }],
        },
        fog: { levels: { ground: { revealed: [square], remembered: [] } } },
      }),
    });
    const asset = {
      path: "library/maps/neu.webp",
      hash: `sha256:${"b".repeat(64)}`,
    };
    library.service.importMap.mockResolvedValue(asset);
    renderCampaign(library);
    const saved = () =>
      JSON.parse(
        library.fs.files().get("campaigns/mine/scenes/a.json") ?? "{}",
      ) as {
        map: { asset: unknown; levels: unknown; grid: unknown };
        fog: unknown;
      };

    await openScene("Höhle");
    expect(screen.getByText("Karte: alt.webp")).toBeTruthy();

    // Cancelling changes nothing.
    fireEvent.click(screen.getByRole("button", { name: "Karte ändern …" }));
    fireEvent.click(await screen.findByRole("button", { name: "Abbrechen" }));
    expect(saved().map.asset).not.toEqual(asset);
    expect(document.activeElement?.textContent).toBe("Karte ändern …");

    fireEvent.click(screen.getByRole("button", { name: "Karte ändern …" }));
    const fog = await screen.findByRole<HTMLInputElement>("checkbox", {
      name: "Nebel zurücksetzen (alles wieder verdeckt)",
    });
    // Focus moves in an effect after the asynchronous update that showed the question.
    await waitFor(() => {
      expect(document.activeElement).toBe(fog);
    });
    fireEvent.click(fog);
    fireEvent.click(screen.getByRole("button", { name: "Karte übernehmen" }));

    expect(await screen.findByText("Karte: neu.webp")).toBeTruthy();
    expect(saved().map.asset).toEqual(asset);
    expect(saved().fog).toEqual({ levels: {} });
    expect(saved().map.levels).toEqual([{ id: "ground", name: "Unten" }]);
    expect(saved().map.grid).toEqual({
      cellSizePx: 70,
      offsetXPx: 0,
      offsetYPx: 0,
    });
  });

  test("a scene without a map gets one without questions", async () => {
    const library = fakeLibraryService("/lib", {
      "campaigns/mine/scenes/a.json": sceneFile("a", "Leer"),
    });
    library.service.importMap.mockResolvedValue({
      path: "library/maps/neu.webp",
      hash: `sha256:${"b".repeat(64)}`,
    });
    renderCampaign(library);
    await openScene("Leer");
    fireEvent.click(
      screen.getByRole("button", { name: "Karte für diese Szene wählen …" }),
    );
    expect(await screen.findByText("Karte: neu.webp")).toBeTruthy();
  });

  test("deletes a scene only after confirming, into the trash", async () => {
    const library = fakeLibraryService("/lib", {
      "campaigns/mine/scenes/a.json": sceneFile("a", "Eingang"),
    });
    renderCampaign(library);
    await openScene("Eingang");

    askToDelete();
    expect(document.activeElement?.textContent).toBe("Ja, löschen");
    fireEvent.click(screen.getByRole("button", { name: "Abbrechen" }));
    // Back on the menu button the command came from.
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Szene" }),
    );
    expect(library.fs.files().has("campaigns/mine/scenes/a.json")).toBe(true);

    askToDelete();
    fireEvent.click(screen.getByRole("button", { name: "Ja, löschen" }));

    expect(
      await screen.findByText(
        "Szene „Eingang“ ist im Papierkorb der Kampagne.",
      ),
    ).toBeTruthy();
    expect(
      await screen.findByText("Noch keine Szenen in dieser Kampagne."),
    ).toBeTruthy();
    const trashed = [...library.fs.files().keys()].filter((path) =>
      path.startsWith("campaigns/mine/.trash/"),
    );
    expect(trashed).toHaveLength(1);
  });

  test("explains when deleting fails and keeps the scene open", async () => {
    const library = fakeLibraryService("/lib", {
      "campaigns/mine/scenes/a.json": sceneFile("a", "Eingang"),
    });
    library.fs.moveToTrash = () => Promise.reject(new Error("Gesperrt"));
    renderCampaign(library);
    await openScene("Eingang");
    askToDelete();
    fireEvent.click(screen.getByRole("button", { name: "Ja, löschen" }));
    expect(
      await screen.findByText("Das hat nicht geklappt: Gesperrt"),
    ).toHaveProperty("role", "alert");
    expect(screen.getByText("Geöffnete Szene: Eingang")).toBeTruthy();
  });

  test("creates a scene from the context menu of the tree, also by keyboard", async () => {
    const library = fakeLibraryService("/lib", {
      "campaigns/mine/scenes/a.json": sceneFile("a", "Eingang"),
    });
    renderCampaign(library);
    const scene = await screen.findByRole("treeitem", { name: "Eingang" });

    fireEvent.contextMenu(screen.getByText("Die verlorene Mine"));
    fireEvent.click(screen.getByRole("menuitem", { name: "Neue Szene …" }));
    let popover = within(screen.getByRole("group", { name: "Neue Szene …" }));
    // Escape closes it and gives focus back to the item it came from.
    fireEvent.keyDown(popover.getByLabelText("Name der neuen Szene"), {
      key: "Escape",
    });
    expect(screen.queryByRole("group", { name: "Neue Szene …" })).toBeNull();
    expect(document.activeElement).toBe(
      screen.getByRole("treeitem", { name: "Die verlorene Mine" }),
    );

    scene.focus();
    fireEvent.keyDown(scene, { key: "F10", shiftKey: true });
    const command = screen.getByRole("menuitem", { name: "Neue Szene …" });
    expect(document.activeElement).toBe(command);
    fireEvent.click(command);
    popover = within(screen.getByRole("group", { name: "Neue Szene …" }));
    fireEvent.change(popover.getByLabelText("Name der neuen Szene"), {
      target: { value: "Gruft" },
    });
    fireEvent.click(popover.getByRole("button", { name: "Szene anlegen" }));
    expect(await screen.findByText("Geöffnete Szene: Gruft")).toBeTruthy();
  });

  test("offers commands only on the campaign and its scenes, named after the item", async () => {
    const library = fakeLibraryService("/lib", {
      "campaigns/mine/scenes/a.json": sceneFile("a", "Eingang"),
    });
    renderCampaign(library);
    await openScene("Eingang");
    fireEvent.contextMenu(
      await screen.findByText("Nebel", { selector: ".dm-tree-label" }),
    );
    expect(screen.queryByRole("menu")).toBeNull();
    fireEvent.contextMenu(
      screen.getByText("Eingang", { selector: ".dm-tree-label" }),
    );
    expect(
      screen.getByRole("menu", { name: "Befehle für „Eingang“" }),
    ).toBeTruthy();
  });

  test("opening the scene menu closes the delete confirmation", async () => {
    const library = fakeLibraryService("/lib", {
      "campaigns/mine/scenes/a.json": sceneFile("a", "Eingang"),
    });
    renderCampaign(library);
    await openScene("Eingang");
    askToDelete();
    expect(screen.getByRole("button", { name: "Ja, löschen" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Szene" }));
    expect(screen.queryByRole("button", { name: "Ja, löschen" })).toBeNull();
    expect(screen.getByRole("menu", { name: "Szene" })).toBeTruthy();
  });

  test("shows the campaign's groups: settings, scenes, maps, players, handouts, notes", async () => {
    const library = fakeLibraryService("/lib", {
      "campaigns/mine/campaign.json": JSON.stringify({
        schemaVersion: 1,
        id: "c",
        name: "Die verlorene Mine",
        players: [{ id: "p1", name: "Anna", characterName: "Mira" }],
        visibilityDefaults: {},
      }),
      "campaigns/mine/scenes/a.json": JSON.stringify({
        ...JSON.parse(sceneFile("a", "Höhle")),
        map: {
          kind: "image",
          asset: {
            path: "library/maps/hoehle.webp",
            hash: `sha256:${"a".repeat(64)}`,
          },
          grid: { cellSizePx: 70, offsetXPx: 0, offsetYPx: 0 },
          levels: [{ id: "ground", name: "Unten" }],
        },
      }),
    });
    renderCampaign(library);
    const groups = await waitFor(() => {
      const items = screen
        .getAllByRole("treeitem")
        .filter((item) => item.getAttribute("aria-level") === "2")
        .map((item) => item.querySelector(".dm-tree-label")?.textContent);
      expect(items).toHaveLength(6);
      return items;
    });
    expect(groups).toEqual([
      "Kampagneneinstellungen",
      "Szenen",
      "Karten",
      "Spieler & Charaktere",
      "Handouts & Hinweise",
      "Notizen",
    ]);
    expect(
      await screen.findByRole("treeitem", { name: "hoehle.webp" }),
    ).toBeTruthy();
    expect(await screen.findByRole("treeitem", { name: "Anna" })).toBeTruthy();
    expect(screen.getByText("Mira")).toBeTruthy();
    expect(screen.getByText("Noch keine Notizen")).toBeTruthy();
    expect(screen.getByText("Noch keine Handouts")).toBeTruthy();
  });

  test("offers a new scene on the scenes group too", async () => {
    renderCampaign(fakeLibraryService("/lib"));
    fireEvent.contextMenu(
      await screen.findByText("Szenen", { selector: ".dm-tree-label" }),
    );
    expect(
      screen.getByRole("menu", { name: "Befehle für „Szenen“" }),
    ).toBeTruthy();
  });

  test("shows the selected item's facts in the details panel", async () => {
    const library = fakeLibraryService("/lib", {
      "campaigns/mine/campaign.json": JSON.stringify({
        schemaVersion: 1,
        id: "c",
        name: "Die verlorene Mine",
        players: [{ id: "p1", name: "Anna", characterName: "Mira" }],
        visibilityDefaults: { token: "hidden" },
      }),
      "campaigns/mine/scenes/a.json": JSON.stringify({
        ...JSON.parse(sceneFile("a", "Höhle")),
        map: {
          kind: "image",
          asset: {
            path: "library/maps/hoehle.webp",
            hash: `sha256:${"a".repeat(64)}`,
          },
          grid: { cellSizePx: 70, offsetXPx: 0, offsetYPx: 0 },
          levels: [{ id: "ground", name: "Unten" }],
        },
      }),
    });
    renderCampaign(library);
    const details = () =>
      within(screen.getByRole("region", { name: "Eigenschaften" }));
    expect(details().getByText("Wähle im Browser einen Eintrag.")).toBeTruthy();

    await openScene("Höhle");
    expect(details().getByText("Höhle")).toBeTruthy();
    expect(details().getByText("70 px pro Feld")).toBeTruthy();
    expect(details().getByText("Geöffnet")).toBeTruthy();

    fireEvent.click(
      // The one in the Karten group (the open scene lists its map file too).
      within(screen.getByRole("treeitem", { name: "Karten" })).getByText(
        "hoehle.webp",
        { selector: ".dm-tree-label" },
      ),
    );
    expect(details().getByText("library/maps/hoehle.webp")).toBeTruthy();
    expect(details().getByText("Höhle")).toBeTruthy();

    fireEvent.click(
      await screen.findByText("Anna", { selector: ".dm-tree-label" }),
    );
    expect(details().getByText("Mira")).toBeTruthy();

    fireEvent.click(
      screen.getByText("Kampagneneinstellungen", {
        selector: ".dm-tree-label",
      }),
    );
    expect(details().getByText("1 Regel")).toBeTruthy();
    // The scene stays open while something else is inspected.
    expect(screen.getByText("Geöffnete Szene: Höhle")).toBeTruthy();
  });
});
