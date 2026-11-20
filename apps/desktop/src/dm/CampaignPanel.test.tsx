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
    schemaVersion: 2,
    id,
    name,
    map: null,
    tokens: [],
    fog: { levels: {} },
    initiative: null,
  });

/** The details panel's content (in the window, the Eigenschaften panel names it). */
function detailsPanel(): HTMLElement {
  const element = document.querySelector<HTMLElement>(".dm-details-body-wrap");
  if (!element) throw new Error("details panel missing");
  return element;
}

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

/** Names of the scenes in no session (campaign › Sessions › Ohne Session › scene). */
const sceneNames = () =>
  within(screen.getByRole("treeitem", { name: "Ohne Session" }))
    .queryAllByRole("treeitem")
    .filter((item) => item.getAttribute("aria-level") === "4")
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
    expect(saved.map).toEqual({ kind: "image", asset, overrides: {} });
    // Grid and levels belong to the map (ADR-0012).
    expect(
      JSON.parse(
        library.fs.files().get("library/maps/hoehle.webp.dm.json") ?? "{}",
      ),
    ).toMatchObject({
      map: {
        grid: { cellSizePx: 100, offsetXPx: 0, offsetYPx: 0 },
        levels: [{ id: "level-1", name: "Erdgeschoss" }],
      },
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
        map: { asset: unknown };
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
    // The new map has no data yet: it takes the old map's grid and levels (ADR-0012).
    expect(
      JSON.parse(
        library.fs.files().get("library/maps/neu.webp.dm.json") ?? "{}",
      ),
    ).toMatchObject({
      map: {
        grid: { cellSizePx: 70, offsetXPx: 0, offsetYPx: 0 },
        levels: [{ id: "ground", name: "Unten" }],
      },
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
    // The menu opens with focus on its first command.
    expect(document.activeElement).toBe(screen.getAllByRole("menuitem")[0]);
    fireEvent.click(screen.getByRole("menuitem", { name: "Neue Szene …" }));
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
        schemaVersion: 2,
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
      "Sessions",
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
    // The campaign note is always there; session and scene notes say they are empty.
    expect(
      screen.getByRole("treeitem", { name: "Kampagnennotiz" }),
    ).toBeTruthy();
    expect(screen.getAllByText("Noch keine Notizen")).toHaveLength(2);
    expect(screen.getByText("Noch keine Handouts")).toBeTruthy();
  });

  test("offers a new scene on Ohne Session and a new session on Sessions", async () => {
    renderCampaign(fakeLibraryService("/lib"));
    fireEvent.contextMenu(
      await screen.findByText("Ohne Session", { selector: ".dm-tree-label" }),
    );
    expect(
      within(
        screen.getByRole("menu", { name: "Befehle für „Ohne Session“" }),
      ).getByRole("menuitem", { name: "Neue Szene …" }),
    ).toBeTruthy();
    fireEvent.keyDown(screen.getByRole("menuitem", { name: "Neue Szene …" }), {
      key: "Escape",
    });
    fireEvent.contextMenu(
      // The first "Sessions" is the group of sessions, the second the session notes.
      screen.getAllByText("Sessions", {
        selector: ".dm-tree-label",
      })[0] as HTMLElement,
    );
    expect(
      within(
        screen.getByRole("menu", { name: "Befehle für „Sessions“" }),
      ).getByRole("menuitem", { name: "Neue Session …" }),
    ).toBeTruthy();
  });

  test("shows the selected item's facts in the details panel", async () => {
    const library = fakeLibraryService("/lib", {
      "campaigns/mine/campaign.json": JSON.stringify({
        schemaVersion: 2,
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
    const details = () => within(detailsPanel());
    expect(details().getByText("Wähle im Browser einen Eintrag.")).toBeTruthy();

    await openScene("Höhle");
    expect(details().getByText("Höhle")).toBeTruthy();
    // Grid and levels come from the map's data, loaded once the scene is open (ADR-0012).
    expect(await details().findByText("70 px pro Feld")).toBeTruthy();
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

  test("a new scene becomes the selection even after something else was selected", async () => {
    renderCampaign(fakeLibraryService("/lib"));
    fireEvent.click(
      await screen.findByText("Die verlorene Mine", {
        selector: ".dm-tree-label",
      }),
    );
    const popover = askForNewScene();
    fireEvent.change(popover.getByLabelText("Name der neuen Szene"), {
      target: { value: "Gruft" },
    });
    fireEvent.click(popover.getByRole("button", { name: "Szene anlegen" }));
    const scene = await screen.findByRole("treeitem", { name: "Gruft" });
    expect(scene.getAttribute("aria-selected")).toBe("true");
    const details = within(detailsPanel());
    expect(await details.findByText("Geöffnet")).toBeTruthy();
  });

  test("a selected group says it has no properties", async () => {
    renderCampaign(fakeLibraryService("/lib"));
    fireEvent.click(
      await screen.findByText("Notizen", { selector: ".dm-tree-label" }),
    );
    expect(
      screen.getByText("Für diesen Eintrag gibt es keine Eigenschaften."),
    ).toBeTruthy();
  });

  describe("sessions (T-160b)", () => {
    const sessionFile = (
      id: string,
      name: string,
      sceneIds: string[],
      date?: string,
    ) =>
      JSON.stringify({
        schemaVersion: 2,
        id,
        name,
        ...(date ? { date } : {}),
        sceneIds,
      });
    const savedIds = (
      library: ReturnType<typeof fakeLibraryService>,
      id: string,
    ) =>
      (
        JSON.parse(
          library.fs.files().get(`campaigns/mine/sessions/${id}.json`) ?? "{}",
        ) as { sceneIds?: string[] }
      ).sceneIds;
    /** Scene labels under a session in tree order. */
    const sessionScenes = (session: string) =>
      within(screen.getByRole("treeitem", { name: session }))
        .queryAllByRole("treeitem")
        .map((item) => item.querySelector(".dm-tree-label")?.textContent);
    const command = (label: string, name: string) => {
      fireEvent.contextMenu(
        screen.getAllByText(label, {
          selector: ".dm-tree-label",
        })[0] as HTMLElement,
      );
      fireEvent.click(screen.getByRole("menuitem", { name }));
    };

    test("shows sessions with their scenes in order, missing ones and Ohne Session", async () => {
      const library = fakeLibraryService("/lib", {
        "campaigns/mine/scenes/a.json": sceneFile("a", "Krypta"),
        "campaigns/mine/scenes/b.json": sceneFile("b", "Gruft"),
        "campaigns/mine/scenes/c.json": sceneFile("c", "Wald"),
        "campaigns/mine/sessions/s1.json": sessionFile("s1", "Session 1", [
          "b",
          "a",
          "gone",
        ]),
        "campaigns/mine/sessions/s2.json": sessionFile("s2", "Session 2", [
          "a",
        ]),
      });
      renderCampaign(library);
      await waitFor(() => {
        expect(sessionScenes("Session 1")).toEqual([
          "Gruft",
          "Krypta",
          "gone (fehlt)",
        ]);
      });
      // A scene in two sessions shows in both; only scenes in none are "Ohne Session".
      expect(sessionScenes("Session 2")).toEqual(["Krypta"]);
      expect(sceneNames()).toEqual(["Wald"]);
    });

    test("creates a session from the ribbon and a scene inside it from its context menu", async () => {
      const library = fakeLibraryService("/lib");
      renderCampaign(library);
      await screen.findByText("Noch keine Szenen in dieser Kampagne.");
      fireEvent.click(screen.getByRole("button", { name: "Neue Session …" }));
      const form = within(
        screen.getByRole("group", { name: "Neue Session …" }),
      );
      fireEvent.change(form.getByLabelText("Name der Session"), {
        target: { value: "Spielabend 1" },
      });
      fireEvent.change(form.getByLabelText("Datum (optional)"), {
        target: { value: "2026-11-28" },
      });
      fireEvent.click(form.getByRole("button", { name: "Session anlegen" }));
      await screen.findByRole("treeitem", { name: "Spielabend 1" });
      expect(
        JSON.parse(
          library.fs.files().get("campaigns/mine/sessions/new-1.json") ?? "{}",
        ),
      ).toMatchObject({
        name: "Spielabend 1",
        date: "2026-11-28",
        sceneIds: [],
      });

      command("Spielabend 1", "Neue Szene …");
      const popover = within(
        screen.getByRole("group", { name: "Neue Szene …" }),
      );
      fireEvent.change(popover.getByLabelText("Name der neuen Szene"), {
        target: { value: "Taverne" },
      });
      fireEvent.click(popover.getByRole("button", { name: "Szene anlegen" }));
      await waitFor(() => {
        expect(savedIds(library, "new-1")).toEqual(["new-2"]);
      });
      expect(await screen.findByText("Geöffnete Szene: Taverne")).toBeTruthy();
    });

    test("reorders, removes and adds scenes, and deletes a session but not its scenes", async () => {
      const library = fakeLibraryService("/lib", {
        "campaigns/mine/scenes/a.json": sceneFile("a", "Krypta"),
        "campaigns/mine/scenes/b.json": sceneFile("b", "Gruft"),
        "campaigns/mine/sessions/s1.json": sessionFile("s1", "Session 1", [
          "a",
          "b",
        ]),
        "campaigns/mine/sessions/s2.json": sessionFile("s2", "Session 2", []),
      });
      renderCampaign(library);
      await waitFor(() => {
        expect(sessionScenes("Session 1")).toEqual(["Krypta", "Gruft"]);
      });

      command("Gruft", "Nach oben");
      await waitFor(() => {
        expect(savedIds(library, "s1")).toEqual(["b", "a"]);
      });
      fireEvent.contextMenu(
        screen.getAllByText("Gruft", {
          selector: ".dm-tree-label",
        })[0] as HTMLElement,
      );
      expect(
        screen
          .getByRole("menuitem", { name: "Nach oben" })
          .getAttribute("aria-disabled"),
      ).toBe("true");
      fireEvent.click(
        screen.getByRole("menuitem", { name: "Aus Session entfernen" }),
      );
      await waitFor(() => {
        expect(savedIds(library, "s1")).toEqual(["a"]);
      });
      await waitFor(() => {
        expect(sceneNames()).toEqual(["Gruft"]);
      });

      command("Gruft", "Zu Session hinzufügen …");
      const add = within(
        screen.getByRole("group", { name: "Zu Session hinzufügen …" }),
      );
      fireEvent.change(add.getByLabelText("Session"), {
        target: { value: "s2" },
      });
      fireEvent.click(add.getByRole("button", { name: "Hinzufügen" }));
      await waitFor(() => {
        expect(savedIds(library, "s2")).toEqual(["b"]);
      });

      command("Session 1", "Session löschen …");
      fireEvent.click(screen.getByRole("button", { name: "Ja, löschen" }));
      await waitFor(() => {
        expect(library.fs.files().has("campaigns/mine/sessions/s1.json")).toBe(
          false,
        );
      });
      expect(library.fs.files().has("campaigns/mine/scenes/a.json")).toBe(true);
      expect(
        await screen.findByText(/Session „Session 1“ ist im Papierkorb/),
      ).toBeTruthy();
    });

    test("edits a session's name and removes its date", async () => {
      const library = fakeLibraryService("/lib", {
        "campaigns/mine/sessions/s1.json": sessionFile(
          "s1",
          "Session 1",
          [],
          "2026-11-28",
        ),
      });
      renderCampaign(library);
      await screen.findByRole("treeitem", { name: "Session 1" });
      command("Session 1", "Session bearbeiten …");
      const form = within(
        screen.getByRole("group", { name: "Session bearbeiten …" }),
      );
      fireEvent.change(form.getByLabelText("Name der Session"), {
        target: { value: "Der Anfang" },
      });
      fireEvent.change(form.getByLabelText("Datum (optional)"), {
        target: { value: "" },
      });
      fireEvent.click(form.getByRole("button", { name: "Speichern" }));
      await waitFor(() => {
        expect(
          JSON.parse(
            library.fs.files().get("campaigns/mine/sessions/s1.json") ?? "{}",
          ),
        ).toEqual({
          schemaVersion: 2,
          id: "s1",
          name: "Der Anfang",
          sceneIds: [],
        });
      });
    });

    test("an unreadable session is listed with its reason", async () => {
      renderCampaign(
        fakeLibraryService("/lib", {
          "campaigns/mine/sessions/bad.json": "{",
        }),
      );
      expect(
        await screen.findByText("bad (kann nicht gelesen werden)"),
      ).toBeTruthy();
    });

    test("a scene in two sessions shows its content only where it was opened", async () => {
      const library = fakeLibraryService("/lib", {
        "campaigns/mine/scenes/a.json": sceneFile("a", "Krypta"),
        "campaigns/mine/sessions/s1.json": sessionFile("s1", "Session 1", [
          "a",
        ]),
        "campaigns/mine/sessions/s2.json": sessionFile("s2", "Session 2", [
          "a",
        ]),
      });
      renderCampaign(library);
      await waitFor(() => {
        expect(sessionScenes("Session 2")).toEqual(["Krypta"]);
      });
      const second = within(
        screen.getByRole("treeitem", { name: "Session 2" }),
      );
      fireEvent.click(
        second.getByText("Krypta", { selector: ".dm-tree-label" }),
      );
      await waitFor(() => {
        expect(second.getAllByRole("treeitem", { name: "Nebel" })).toHaveLength(
          1,
        );
      });
      expect(
        within(screen.getByRole("treeitem", { name: "Session 1" })).queryByRole(
          "treeitem",
          { name: "Nebel" },
        ),
      ).toBeNull();
    });

    test("says so when a new scene cannot be added to its session, and keeps it", async () => {
      const library = fakeLibraryService("/lib", {
        "campaigns/mine/sessions/s1.json": sessionFile("s1", "Session 1", []),
      });
      renderCampaign(library);
      await screen.findByRole("treeitem", { name: "Session 1" });
      command("Session 1", "Neue Szene …");
      const write = library.fs.writeAtomic.bind(library.fs);
      library.fs.writeAtomic = (path, text) =>
        path.includes("/sessions/")
          ? Promise.reject(new Error("Gesperrt"))
          : write(path, text);
      const popover = within(
        screen.getByRole("group", { name: "Neue Szene …" }),
      );
      fireEvent.change(popover.getByLabelText("Name der neuen Szene"), {
        target: { value: "Taverne" },
      });
      fireEvent.click(popover.getByRole("button", { name: "Szene anlegen" }));
      expect(
        await screen.findByText(
          "Szene „Taverne“ angelegt, aber nicht zur Session hinzugefügt: Das hat nicht geklappt: Gesperrt",
        ),
      ).toBeTruthy();
      expect(
        (await screen.findByRole("treeitem", { name: "Taverne" })).getAttribute(
          "aria-selected",
        ),
      ).toBe("true");
      expect(sceneNames()).toEqual(["Taverne"]);
    });

    test("removes a missing scene from its session and deletes an unreadable session", async () => {
      const library = fakeLibraryService("/lib", {
        "campaigns/mine/sessions/s1.json": sessionFile("s1", "Session 1", [
          "gone",
        ]),
        "campaigns/mine/sessions/bad.json": "{",
      });
      renderCampaign(library);
      await screen.findByText("gone (fehlt)", { selector: ".dm-tree-label" });
      command("gone (fehlt)", "Aus Session entfernen");
      await waitFor(() => {
        expect(savedIds(library, "s1")).toEqual([]);
      });
      command("bad (kann nicht gelesen werden)", "Session löschen …");
      fireEvent.click(screen.getByRole("button", { name: "Ja, löschen" }));
      await waitFor(() => {
        expect(library.fs.files().has("campaigns/mine/sessions/bad.json")).toBe(
          false,
        );
      });
    });

    describe("notes (T-161b)", () => {
      const details = () => within(detailsPanel());

      test("opens a scene's note, starting it, and shows changes made elsewhere", async () => {
        const library = fakeLibraryService("/lib", {
          "campaigns/mine/scenes/a.json": sceneFile("a", "Krypta"),
        });
        renderCampaign(library);
        command(
          (
            await screen.findAllByText("Krypta", { selector: ".dm-tree-label" })
          )[0]?.textContent ?? "Krypta",
          "Notiz öffnen",
        );
        await waitFor(() => {
          expect(
            library.fs.files().get("campaigns/mine/notes/scenes/a.md"),
          ).toBe("# Krypta\n");
        });
        // Rendered: the "# Krypta" line is a heading.
        expect(
          await details().findByRole("heading", { name: "Krypta" }),
        ).toBeTruthy();
        expect(
          await screen.findByRole("treeitem", {
            name: "Krypta",
            selected: true,
          }),
        ).toBeTruthy();

        // Written in Obsidian on another device:
        await library.fs.writeAtomic(
          "campaigns/mine/notes/scenes/a.md",
          "# Krypta\nDer Wächter schläft.\n",
        );
        library.emit(["campaigns/mine/notes/scenes/a.md"]);
        expect(await details().findByText(/Der Wächter schläft/)).toBeTruthy();
      });

      test("links an existing note to a session, shows it and removes the link", async () => {
        const library = fakeLibraryService("/lib", {
          "campaigns/mine/sessions/s1.json": sessionFile("s1", "Session 1", []),
          "campaigns/mine/wiki/Strahd.md":
            "---\nrole: villain\n---\n# Strahd\n",
        });
        renderCampaign(library);
        await screen.findByRole("treeitem", { name: "Session 1" });
        command("Session 1", "Notiz verknüpfen …");
        const form = within(
          screen.getByRole("group", { name: "Notiz verknüpfen …" }),
        );
        fireEvent.change(form.getByLabelText("Pfad der Notiz"), {
          target: { value: "wiki/Fehlt.md" },
        });
        fireEvent.click(form.getByRole("button", { name: "Verknüpfen" }));
        expect(
          await form.findByText(
            "„wiki/Fehlt.md“ gibt es im Kampagnenordner nicht.",
          ),
        ).toBeTruthy();
        fireEvent.change(form.getByLabelText("Pfad der Notiz"), {
          target: { value: "wiki/Strahd.md" },
        });
        fireEvent.click(form.getByRole("button", { name: "Verknüpfen" }));
        await waitFor(() => {
          expect(
            JSON.parse(
              library.fs.files().get("campaigns/mine/sessions/s1.json") ?? "{}",
            ),
          ).toMatchObject({ notes: ["wiki/Strahd.md"] });
        });
        expect(
          await screen.findByRole("treeitem", { name: "Session 1 › Strahd" }),
        ).toBeTruthy();
        // Front matter shows as properties above the rendered text.
        expect(await details().findByText("villain")).toBeTruthy();
        expect(details().getByRole("heading", { name: "Strahd" })).toBeTruthy();

        command("Session 1 › Strahd", "Verknüpfung entfernen");
        await waitFor(() => {
          expect(
            JSON.parse(
              library.fs.files().get("campaigns/mine/sessions/s1.json") ?? "{}",
            ),
          ).not.toHaveProperty("notes");
        });
        expect(library.fs.files().has("campaigns/mine/wiki/Strahd.md")).toBe(
          true,
        );
      });

      test("offers no linking for the open scene (it saves its whole state)", async () => {
        const library = fakeLibraryService("/lib", {
          "campaigns/mine/scenes/a.json": sceneFile("a", "Krypta"),
        });
        renderCampaign(library);
        await openScene("Krypta");
        fireEvent.contextMenu(
          screen.getAllByText("Krypta", {
            selector: ".dm-tree-label",
          })[0] as HTMLElement,
        );
        expect(
          screen
            .getByRole("menuitem", { name: "Notiz verknüpfen …" })
            .getAttribute("aria-disabled"),
        ).toBe("true");
        expect(
          screen
            .getByRole("menuitem", { name: "Notiz öffnen" })
            .getAttribute("aria-disabled"),
        ).toBeNull();
      });

      test("links a note to the campaign, refuses its own note and lists repeated links once", async () => {
        const library = fakeLibraryService("/lib", {
          "campaigns/mine/campaign.json": JSON.stringify({
            schemaVersion: 2,
            id: "c",
            name: "Die verlorene Mine",
            players: [],
            visibilityDefaults: {},
          }),
          "campaigns/mine/wiki/Welt.md": "# Welt\n",
          "campaigns/mine/scenes/a.json": JSON.stringify({
            ...JSON.parse(sceneFile("a", "Krypta")),
            // Hand-edited on another device: the same link twice.
            notes: ["wiki/Welt.md", "wiki/Welt.md"],
          }),
        });
        renderCampaign(library);
        expect(
          await screen.findAllByRole("treeitem", { name: "Krypta › Welt" }),
        ).toHaveLength(1);

        command("Die verlorene Mine", "Notiz verknüpfen …");
        const form = within(
          screen.getByRole("group", { name: "Notiz verknüpfen …" }),
        );
        fireEvent.change(form.getByLabelText("Pfad der Notiz"), {
          target: { value: "notes/campaign.md" },
        });
        fireEvent.click(form.getByRole("button", { name: "Verknüpfen" }));
        expect(await form.findByText(/Das ist die eigene Notiz/)).toBeTruthy();
        fireEvent.change(form.getByLabelText("Pfad der Notiz"), {
          target: { value: "wiki/Welt.md" },
        });
        fireEvent.click(form.getByRole("button", { name: "Verknüpfen" }));
        await waitFor(() => {
          expect(
            JSON.parse(
              library.fs.files().get("campaigns/mine/campaign.json") ?? "{}",
            ),
          ).toMatchObject({ notes: ["wiki/Welt.md"] });
        });
        expect(
          await screen.findByRole("treeitem", { name: "Welt" }),
        ).toBeTruthy();
      });

      test("says when a linked note's file is missing", async () => {
        renderCampaign(
          fakeLibraryService("/lib", {
            "campaigns/mine/sessions/s1.json": JSON.stringify({
              schemaVersion: 2,
              id: "s1",
              name: "Session 1",
              sceneIds: [],
              notes: ["wiki/Weg.md"],
            }),
          }),
        );
        fireEvent.click(
          await screen.findByText("Session 1 › Weg", {
            selector: ".dm-tree-label",
          }),
        );
        expect(
          await details().findByText("Diese Notiz gibt es (noch) nicht."),
        ).toBeTruthy();
      });
    });
  });
});
