import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { describe, expect, test } from "vitest";
import { createI18n } from "@dungeon-manager/ui";
import { LibraryError, type LibraryService } from "../platform/library.js";
import { fakeLibraryService } from "./fake-library.test-data.js";
import { LibraryPanel } from "./LibraryPanel.js";

const campaignFile = (name: string) =>
  JSON.stringify({
    schemaVersion: 1,
    id: "c1",
    name,
    players: [],
    visibilityDefaults: {},
  });

function renderPanel(service: LibraryService) {
  return render(
    <I18nextProvider i18n={createI18n("de")}>
      <LibraryPanel service={service} newId={() => "id-1"} />
    </I18nextProvider>,
  );
}

describe("LibraryPanel", () => {
  test("asks for a folder when none is chosen on this device", async () => {
    renderPanel(fakeLibraryService(null).service);
    expect(
      await screen.findByText(/Noch kein Bibliotheksordner gewählt/),
    ).toBeTruthy();
  });

  test("choosing a folder creates the layout and lists its campaigns", async () => {
    const library = fakeLibraryService(null, {
      "campaigns/mine/campaign.json": campaignFile("Die verlorene Mine"),
      "campaigns/cloud/campaign.json": { placeholder: true },
      "campaigns/broken/campaign.json": "{",
    });
    library.service.chooseRoot.mockImplementation(() => {
      library.setRoot("/Users/dm/Dropbox/DM");
      return Promise.resolve("/Users/dm/Dropbox/DM");
    });
    renderPanel(library.service);

    fireEvent.click(
      await screen.findByRole("button", { name: "Bibliotheksordner wählen …" }),
    );

    expect(
      await screen.findByText("Ordner: /Users/dm/Dropbox/DM"),
    ).toBeTruthy();
    const items = screen
      .getAllByRole("listitem")
      .map((item) => item.textContent);
    expect(items).toEqual([
      "broken (kann nicht gelesen werden)",
      "cloud (noch nicht heruntergeladen)",
      "Die verlorene Mine",
    ]);
    expect(library.fs.directories()).toContain("library/maps");
  });

  test("picks up campaigns added on disk while the app runs", async () => {
    const library = fakeLibraryService("/lib");
    renderPanel(library.service);
    expect(
      await screen.findByText("Noch keine Kampagnen in dieser Bibliothek."),
    ).toBeTruthy();

    await library.fs.writeAtomic(
      "campaigns/new/campaign.json",
      campaignFile("Neue Kampagne"),
    );
    // Asset, temp and scene files inside a campaign do not change the campaign list.
    library.emit([
      "library/maps/cave.png",
      "campaigns/new/campaign.json.tmp",
      "campaigns/old/scenes/s.json",
    ]);
    library.emit(["campaigns/new/campaign.json"]);

    expect(await screen.findByText("Neue Kampagne")).toBeTruthy();
    expect(library.service.currentRoot).toHaveBeenCalledTimes(2);
  });

  test("creates a campaign from the browser header and opens it", async () => {
    const library = fakeLibraryService("/lib");
    renderPanel(library.service);

    fireEvent.click(
      await screen.findByRole("button", { name: "Kampagne wählen" }),
    );
    fireEvent.click(screen.getByRole("menuitem", { name: "Neue Kampagne …" }));
    const field = screen.getByLabelText("Name der neuen Kampagne");
    expect(document.activeElement).toBe(field);
    fireEvent.change(field, { target: { value: "Fluch über Größenwahn" } });
    fireEvent.click(screen.getByRole("button", { name: "Kampagne anlegen" }));

    expect(
      await screen.findByRole("treeitem", { name: "Fluch über Größenwahn" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Kampagne wechseln" }),
    ).toHaveProperty("ariaHasPopup", "menu");
    expect(screen.queryByLabelText("Name der neuen Kampagne")).toBeNull();
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Kampagne wechseln" }),
    );
    expect(
      library.fs
        .files()
        .has("campaigns/fluch-ueber-groessenwahn/campaign.json"),
    ).toBe(true);
    expect(
      screen.getByText("Kampagne „Fluch über Größenwahn“ angelegt."),
    ).toBeTruthy();
  });

  test("switches campaigns from the list and from the header menu", async () => {
    const library = fakeLibraryService("/lib", {
      "campaigns/mine/campaign.json": campaignFile("Die verlorene Mine"),
      "campaigns/crypt/campaign.json": campaignFile("Fluch der Krypta"),
    });
    renderPanel(library.service);
    expect(await screen.findByText("Wähle eine Kampagne:")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Fluch der Krypta" }));
    expect(
      await screen.findByRole("treeitem", { name: "Fluch der Krypta" }),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Kampagne wechseln" }));
    fireEvent.click(
      screen.getByRole("menuitem", { name: "Die verlorene Mine" }),
    );
    expect(
      await screen.findByRole("treeitem", { name: "Die verlorene Mine" }),
    ).toBeTruthy();
  });

  test("a slow earlier load never overwrites a newer folder choice", async () => {
    const library = fakeLibraryService(null);
    let finishInitial: (root: string | null) => void = () => undefined;
    library.service.currentRoot.mockReturnValueOnce(
      new Promise((resolve) => {
        finishInitial = resolve;
      }),
    );
    library.service.chooseRoot.mockResolvedValue("/new");
    renderPanel(library.service);

    fireEvent.click(
      screen.getByRole("button", { name: "Bibliotheksordner wählen …" }),
    );
    expect(await screen.findByText("Ordner: /new")).toBeTruthy();
    finishInitial("/old");
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.queryByText("Ordner: /old")).toBeNull();
    expect(screen.getByText("Ordner: /new")).toBeTruthy();
  });

  test("shows a translated error and stops listening when unmounted", async () => {
    const library = fakeLibraryService("/lib");
    library.service.currentRoot.mockRejectedValueOnce(
      new LibraryError("noLibrary"),
    );
    const { unmount } = renderPanel(library.service);
    expect((await screen.findByRole("alert")).textContent).toBe(
      "Es ist kein Bibliotheksordner geöffnet. Bitte einen Ordner wählen.",
    );
    unmount();
    await waitFor(() => {
      expect(library.listenerCount()).toBe(0);
    });
  });
});
