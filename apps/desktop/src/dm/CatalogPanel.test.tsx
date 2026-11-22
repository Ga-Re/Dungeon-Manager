import type { MemoryFileContent } from "@dungeon-manager/storage";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { createI18n } from "@dungeon-manager/ui";
import { LibraryError } from "../platform/library.js";
import type { MapViewService } from "../platform/map-images.js";
import { CatalogPanel } from "./CatalogPanel.js";
import { fakeLibraryService } from "./fake-library.test-data.js";
import { renderPreview } from "./map-preview.js";
import { MapViewContext } from "./MapView.js";

// jsdom draws nothing: the preview is made by a stand-in (map-preview.ts has its own tests).
vi.mock("./map-preview.js", () => ({
  renderPreview: vi.fn(() =>
    Promise.resolve(new Blob(["drawn"], { type: "image/webp" })),
  ),
}));

/** The fake library hashes every file to this (fake-library.test-data.ts). */
const HEX = "b".repeat(64);
const PREVIEW = `library/.previews/${HEX}.webp`;

const maps = {} as MapViewService;

function renderCatalog(
  ready = true,
  files: Record<string, MemoryFileContent> = {},
) {
  const library = fakeLibraryService("/lib", files);
  render(
    <I18nextProvider i18n={createI18n("de")}>
      <MapViewContext value={maps}>
        <CatalogPanel service={library.service} ready={ready} />
      </MapViewContext>
    </I18nextProvider>,
  );
  return library;
}

const grid = () => screen.findByRole("list", { name: "Karten" });

beforeEach(() => {
  URL.createObjectURL = vi.fn(() => "blob:preview");
  URL.revokeObjectURL = vi.fn();
  vi.mocked(renderPreview).mockClear();
});

const importButton = () =>
  screen.getByRole("button", { name: "Karte importieren …" });

describe("CatalogPanel", () => {
  test("shows the catalogue groups with their empty hints", () => {
    renderCatalog();
    expect(screen.getByRole("heading", { name: "Katalog" })).toBeTruthy();
    for (const group of ["Karten", "Token", "Assets"])
      expect(screen.getByRole("heading", { name: group })).toBeTruthy();
    expect(screen.getByText("Noch keine Token.")).toBeTruthy();
  });

  test("lists the library's maps of every folder with previews, but no sidecars (T-124)", async () => {
    const library = renderCatalog(true, {
      "library/maps/Höhlen/see.png": "png",
      "library/maps/turm.webm": "webm",
      "library/maps/turm.webm.dm.json": "{}",
      [PREVIEW]: "webp",
    });
    const tiles = within(await grid()).getAllByRole("listitem");
    expect(tiles.map((tile) => tile.title)).toEqual([
      "library/maps/Höhlen/see.png",
      "library/maps/turm.webm",
    ]);
    const [cave, tower] = tiles;
    if (!cave || !tower) throw new Error("two tiles expected");
    expect(within(cave).getByText("Höhlen")).toBeTruthy();
    expect(within(tower).getByText("Video")).toBeTruthy();
    await waitFor(() => {
      expect(document.querySelectorAll(".dm-map-thumb img")).toHaveLength(2);
    });
    // The stored previews are shown; nothing is drawn again.
    expect(library.service.readImage).toHaveBeenCalledWith(PREVIEW);
    expect(renderPreview).not.toHaveBeenCalled();
  });

  test("draws a missing preview once and stores it", async () => {
    const library = renderCatalog(true, { "library/maps/see.png": "png" });
    await waitFor(() => {
      expect(library.service.writePreview).toHaveBeenCalledTimes(1);
    });
    expect(renderPreview).toHaveBeenCalledWith(
      maps,
      expect.objectContaining({ path: "library/maps/see.png" }),
    );
    const [hash, bytes] = library.service.writePreview.mock.calls[0] ?? [];
    expect(hash).toBe(`sha256:${HEX}`);
    expect(new TextDecoder().decode(bytes)).toBe("drawn");
    await waitFor(() => {
      expect(document.querySelector(".dm-map-thumb img")).toBeTruthy();
    });
  });

  test("searches by file and folder name", async () => {
    renderCatalog(true, {
      "library/maps/Höhlen/see.png": "png",
      "library/maps/Stadt/markt.png": "png",
      "library/maps/turm.png": "png",
    });
    await grid();
    const search = screen.getByRole("searchbox", { name: "Karten suchen" });
    fireEvent.change(search, { target: { value: "höhlen SEE" } });
    expect(
      within(await grid())
        .getAllByRole("listitem")
        .map((tile) => tile.title),
    ).toEqual(["library/maps/Höhlen/see.png"]);
    fireEvent.change(search, { target: { value: "drache" } });
    expect(screen.getByText("Keine Karte passt zur Suche.")).toBeTruthy();
  });

  test("marks a map whose data has conflict copies", async () => {
    renderCatalog(true, {
      "library/maps/turm.png": "png",
      "library/maps/turm.png.dm.json": "{}",
      "library/maps/turm.png.dm (conflicted copy 2026-11-20).json": "{}",
    });
    expect(
      within(await grid()).getByText("1 Konfliktkopie der Kartendaten"),
    ).toBeTruthy();
  });

  test("shows maps added on disk while the app runs", async () => {
    const library = renderCatalog(true, { "library/maps/turm.png": "png" });
    await grid();
    await library.fs.writeAtomic("library/maps/neu.png", "png");
    library.emit(["library/maps/neu.png"]);
    await waitFor(() => {
      expect(screen.getByTitle("library/maps/neu.png")).toBeTruthy();
    });
  });

  test("imports a map into the library", async () => {
    const library = renderCatalog();
    library.service.importMap.mockImplementation(async () => {
      await library.fs.writeAtomic("library/maps/hoehle.webp", "webp");
      return { path: "library/maps/hoehle.webp", hash: `sha256:${HEX}` };
    });
    expect(await screen.findByText(/Noch keine Karten/)).toBeTruthy();
    fireEvent.click(importButton());
    expect(
      await screen.findByText("„hoehle.webp“ liegt jetzt in der Bibliothek."),
    ).toBeTruthy();
    // Listed at once, without waiting for the watcher.
    expect(await screen.findByTitle("library/maps/hoehle.webp")).toBeTruthy();
  });

  test("explains a refused file and needs an open library", async () => {
    const library = renderCatalog();
    library.service.importMap.mockRejectedValue(
      new LibraryError("unsupportedFile", "/x.txt"),
    );
    fireEvent.click(importButton());
    expect(
      await screen.findByText(/kein PNG-, JPG- oder WebP-Bild/),
    ).toBeTruthy();
  });

  test("cannot import without a library folder", () => {
    renderCatalog(false);
    expect(importButton()).toHaveProperty("disabled", true);
    expect(
      screen.getByText(
        "Wähle zuerst in den Einstellungen einen Bibliotheksordner.",
      ),
    ).toBeTruthy();
  });
});
