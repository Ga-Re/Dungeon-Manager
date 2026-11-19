import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createI18n } from "@dungeon-manager/ui";
import { I18nextProvider } from "react-i18next";
import { beforeAll, describe, expect, test, vi } from "vitest";
import { fakeLibraryService } from "./fake-library.test-data.js";
import { NoteView } from "./NoteView.js";

beforeAll(() => {
  // jsdom has no object URLs.
  URL.createObjectURL = vi.fn(() => "blob:note-image");
  URL.revokeObjectURL = vi.fn();
});

function renderNote(text: string, files: string[] = []) {
  const library = fakeLibraryService("/lib", {
    "campaigns/mine/notes/scenes/bilder/karte.png": "png",
    "campaigns/mine/attachments/wappen.png": "png",
  });
  const onOpenNote = vi.fn();
  const view = render(
    <I18nextProvider i18n={createI18n("de")}>
      <NoteView
        text={text}
        notePath="notes/scenes/a.md"
        slug="mine"
        service={library.service}
        files={files}
        onOpenNote={onOpenNote}
      />
    </I18nextProvider>,
  );
  return { library, onOpenNote, ...view };
}

describe("NoteView (T-163)", () => {
  test("renders Markdown with GFM tables and the front matter as properties", () => {
    renderNote(
      "---\nrole: villain\n---\n# Strahd\n\n| HP | AC |\n|---|---|\n| 144 | 16 |\n\n- [x] erledigt\n",
    );
    expect(screen.getByRole("heading", { name: "Strahd" })).toBeTruthy();
    expect(screen.getByRole("table")).toBeTruthy();
    expect(screen.getByText("role")).toBeTruthy();
    expect(screen.getByText("villain")).toBeTruthy();
    expect(screen.getByRole("checkbox")).toHaveProperty("checked", true);
  });

  test("never renders raw HTML or unsafe links from a note", () => {
    const { container } = renderNote(
      '<img src="x" onerror="alert(1)"><script>alert(2)</script>\n\n[klick](javascript:alert(3))\n',
    );
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector('img[src="x"]')).toBeNull();
    expect(container.querySelector("a")).toBeNull();
    expect(screen.getByText("klick")).toBeTruthy();
  });

  test("shows a local image relative to the note and an Obsidian embed found by name", async () => {
    const { library } = renderNote(
      "![Karte](bilder/karte.png)\n\n![[wappen.png]]\n",
      ["attachments/wappen.png", "notes/scenes/bilder/karte.png"],
    );
    await waitFor(() => {
      expect(screen.getAllByRole("img")).toHaveLength(2);
    });
    expect(library.service.readImage).toHaveBeenCalledWith(
      "campaigns/mine/notes/scenes/bilder/karte.png",
    );
    expect(library.service.readImage).toHaveBeenCalledWith(
      "campaigns/mine/attachments/wappen.png",
    );
  });

  test("says when an image is missing or would leave the campaign folder", async () => {
    renderNote("![[fehlt.png]]\n\n![x](../../../../etc/passwd.png)\n");
    expect(
      await screen.findByText("Bild nicht gefunden: fehlt.png"),
    ).toBeTruthy();
    expect(screen.getByText("Bild nicht gefunden: x")).toBeTruthy();
  });

  test("loads an external image only on request", () => {
    renderNote("![Burg](https://example.org/burg.png)\n");
    expect(screen.queryByRole("img")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Bild laden" }));
    const image = screen.getByRole("img", { name: "Burg" });
    expect(image.getAttribute("src")).toBe("https://example.org/burg.png");
    expect(image.getAttribute("referrerpolicy")).toBe("no-referrer");
  });

  test("opens wiki links and relative note links; external links only show their address", () => {
    const { onOpenNote, container } = renderNote(
      "[[Strahd|den Grafen]] · [Wald](../wald.md) · [Wiki](https://example.org)\n",
      ["wiki/Strahd.md", "notes/wald.md"],
    );
    fireEvent.click(screen.getByRole("button", { name: "den Grafen" }));
    expect(onOpenNote).toHaveBeenCalledWith("wiki/Strahd.md");
    fireEvent.click(screen.getByRole("button", { name: "Wald" }));
    expect(onOpenNote).toHaveBeenCalledWith("notes/wald.md");
    expect(container.querySelector("a")).toBeNull();
    expect(screen.getByText("(https://example.org)")).toBeTruthy();
  });

  test("renders callouts as boxes with their title", () => {
    const { container } = renderNote(
      "> [!warning] Falle\n> Der Boden gibt nach.\n",
    );
    const callout = container.querySelector(".dm-callout.dm-callout-warning");
    expect(callout?.querySelector(".dm-callout-title")?.textContent).toBe(
      "Falle",
    );
    expect(callout?.textContent).toContain("Der Boden gibt nach.");
  });
});
