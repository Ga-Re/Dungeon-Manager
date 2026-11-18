import { createI18n } from "@dungeon-manager/ui";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { describe, expect, it } from "vitest";
import { DmShell } from "./DmShell.js";
import { ShellPortal } from "./slots.js";

function memoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear: () => {
      data.clear();
    },
    getItem: (key) => data.get(key) ?? null,
    key: () => null,
    removeItem: (key) => {
      data.delete(key);
    },
    setItem: (key, value) => {
      data.set(key, value);
    },
  };
}

function setup() {
  const storage = memoryStorage();
  const root = document.createElement("html");
  render(
    <I18nextProvider i18n={createI18n()}>
      <DmShell
        storage={storage}
        root={root}
        dataPanel={<p>Bibliotheksinhalt</p>}
      >
        <ShellPortal slot="canvas">
          <div data-testid="map" />
        </ShellPortal>
        <ShellPortal slot="ribbonFog">
          <button type="button">Aufdecken</button>
        </ShellPortal>
      </DmShell>
    </I18nextProvider>,
  );
  return { storage, root };
}

const toggleButton = () =>
  screen.getByRole("button", { name: /Datenpanel ein- oder ausblenden/ });
/** The panel the toggle controls (a hidden element has no accessible name to query by). */
function panel(): HTMLElement {
  const id = toggleButton().getAttribute("aria-controls");
  const element = id ? document.getElementById(id) : null;
  if (!element) throw new Error("data panel missing");
  return element;
}
const toggle = toggleButton;

describe("DmShell", () => {
  it("renders portalled parts into their zones", () => {
    setup();
    expect(screen.getByTestId("map").closest(".dm-canvas")).not.toBeNull();
    expect(within(panel()).getByText("Bibliotheksinhalt")).toBeTruthy();
  });

  it("toggles the data panel with its button", () => {
    setup();
    expect(panel().hidden).toBe(false);
    expect(toggle().getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(toggle());
    expect(panel().hidden).toBe(true);
    expect(toggle().getAttribute("aria-pressed")).toBe("false");
  });

  it("toggles the data panel with Cmd+B and Ctrl+B, but not in rich-text fields", () => {
    setup();
    fireEvent.keyDown(window, { key: "b", metaKey: true });
    expect(panel().hidden).toBe(true);
    fireEvent.keyDown(window, { key: "B", ctrlKey: true });
    expect(panel().hidden).toBe(false);
    fireEvent.keyDown(window, { key: "b", ctrlKey: true, shiftKey: true });
    expect(panel().hidden).toBe(false);
    const editor = document.createElement("div");
    editor.contentEditable = "true";
    // jsdom does not implement isContentEditable.
    Object.defineProperty(editor, "isContentEditable", { value: true });
    document.body.append(editor);
    fireEvent.keyDown(editor, { key: "b", metaKey: true });
    expect(panel().hidden).toBe(false);
    editor.remove();
  });

  it("switches ribbon modes by click and arrow keys", () => {
    setup();
    const display = screen.getByRole("tab", { name: "Anzeige" });
    expect(display.getAttribute("aria-selected")).toBe("true");
    expect(screen.queryByRole("button", { name: "Aufdecken" })).toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: "Nebel" }));
    expect(screen.getByRole("button", { name: "Aufdecken" })).toBeTruthy();
    fireEvent.keyDown(screen.getByRole("tab", { name: "Nebel" }), {
      key: "ArrowRight",
    });
    expect(
      screen
        .getByRole("tab", { name: "Anzeige" })
        .getAttribute("aria-selected"),
    ).toBe("true");
    expect(document.activeElement).toBe(
      screen.getByRole("tab", { name: "Anzeige" }),
    );
    const focusedTab = document.activeElement;
    if (!focusedTab) throw new Error("nothing focused");
    fireEvent.keyDown(focusedTab, { key: "ArrowLeft" });
    expect(
      screen.getByRole("tab", { name: "Nebel" }).getAttribute("aria-selected"),
    ).toBe("true");
  });

  it("applies and stores the theme chosen in the settings", () => {
    const { storage, root } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Einstellungen" }));
    const dialog = screen.getByRole("dialog", { name: "Einstellungen" });
    expect(
      within(dialog).getByRole("radio", { name: "Hell (Pergament)" }),
    ).toHaveProperty("checked", true);
    fireEvent.click(
      within(dialog).getByRole("radio", { name: "Dunkel (Nacht)" }),
    );
    expect(root.dataset["dmTheme"]).toBe("night");
    expect(storage.getItem("dm.theme")).toBe("dark");
    fireEvent.click(
      within(dialog).getByRole("radio", { name: "Wie das Betriebssystem" }),
    );
    expect(root.dataset["dmTheme"]).toBe("system");
  });

  it("closes the settings with Escape (focus back on the gear) and on an outside click", () => {
    setup();
    const gear = screen.getByRole("button", { name: "Einstellungen" });
    fireEvent.click(gear);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(gear);
    fireEvent.click(gear);
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
