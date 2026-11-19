import { fireEvent, render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { describe, expect, test } from "vitest";
import { createI18n } from "@dungeon-manager/ui";
import { LibraryError } from "../platform/library.js";
import { CatalogPanel } from "./CatalogPanel.js";
import { fakeLibraryService } from "./fake-library.test-data.js";

function renderCatalog(ready = true) {
  const library = fakeLibraryService("/lib");
  render(
    <I18nextProvider i18n={createI18n("de")}>
      <CatalogPanel service={library.service} ready={ready} />
    </I18nextProvider>,
  );
  return library;
}

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

  test("imports a map into the library", async () => {
    const library = renderCatalog();
    library.service.importMap.mockResolvedValue({
      path: "library/maps/hoehle.webp",
      hash: `sha256:${"b".repeat(64)}`,
    });
    fireEvent.click(importButton());
    expect(
      await screen.findByText("„hoehle.webp“ liegt jetzt in der Bibliothek."),
    ).toBeTruthy();
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
