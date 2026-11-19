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
    key: (index) => [...data.keys()][index] ?? null,
    removeItem: (key) => {
      data.delete(key);
    },
    setItem: (key, value) => {
      data.set(key, value);
    },
  };
}

function setup(storage = memoryStorage()) {
  const root = document.createElement("html");
  render(
    <I18nextProvider i18n={createI18n()}>
      <DmShell storage={storage} root={root}>
        <ShellPortal slot="dataPanel">
          <p>Bibliotheksinhalt</p>
        </ShellPortal>
        <ShellPortal slot="settings">
          <p>Bibliotheksordner</p>
        </ShellPortal>
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

const workspaceMenu = () =>
  within(screen.getByRole("group", { name: "Arbeitsbereich" })).getByRole(
    "button",
  );

describe("DmShell", () => {
  it("starts in Game Mode with its tabs", () => {
    setup();
    expect(workspaceMenu().textContent).toBe("Game Mode");
    expect(
      within(screen.getByRole("tablist", { name: "Werkzeugleisten" }))
        .getAllByRole("tab")
        .map((tab) => tab.textContent),
    ).toEqual(["Szene", "Nebel", "Anzeige"]);
  });

  it("switches the workspace from its menu, keeps Game Mode's tools and remembers it", () => {
    const { storage } = setup();
    fireEvent.click(screen.getByRole("tab", { name: "Nebel" }));
    const tool = screen.getByRole("button", { name: "Aufdecken" });

    fireEvent.click(workspaceMenu());
    expect(
      screen.getAllByRole("menuitem").map((item) => item.textContent),
    ).toEqual(["Map Forge", "Asset Studio", "Campaign Atlas", "Game Mode"]);
    fireEvent.click(screen.getByRole("menuitem", { name: "Map Forge" }));

    expect(workspaceMenu().textContent).toBe("Map Forge");
    expect(
      screen.queryByRole("tablist", { name: "Werkzeugleisten" }),
    ).toBeNull();
    expect(
      screen.getByText("Hier bearbeitest du bald deine Karten."),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Aufdecken" })).toBeNull();
    expect(storage.getItem("dm.workspace")).toBe("mapForge");

    fireEvent.click(workspaceMenu());
    fireEvent.click(screen.getByRole("menuitem", { name: "Game Mode" }));
    // The same tool, not a new one: tools keep their state across workspaces.
    expect(screen.getByRole("button", { name: "Aufdecken" })).toBe(tool);
    expect(
      screen.getByRole("tab", { name: "Nebel" }).getAttribute("aria-selected"),
    ).toBe("true");
  });

  it("starts in the workspace last used on this device", () => {
    const storage = memoryStorage();
    storage.setItem("dm.workspace", "campaignAtlas");
    setup(storage);
    expect(workspaceMenu().textContent).toBe("Campaign Atlas");
    expect(
      screen.getByText("Hier bearbeitest du bald die aktuelle Kampagne."),
    ).toBeTruthy();
  });

  it("renders portalled parts into their zones", () => {
    setup();
    expect(screen.getByTestId("map").closest(".dm-canvas")).not.toBeNull();
    expect(within(panel()).getByText("Bibliotheksinhalt")).toBeTruthy();
    // The library's settings appear in their category of the settings dialog.
    expect(screen.queryByText("Bibliotheksordner")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Einstellungen" }));
    fireEvent.click(screen.getByRole("tab", { name: "Bibliothek" }));
    expect(
      within(screen.getByRole("dialog", { name: "Einstellungen" })).getByText(
        "Bibliotheksordner",
      ),
    ).toBeTruthy();
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
    const gear = screen.getByRole("button", { name: "Einstellungen" });
    expect(gear.getAttribute("aria-haspopup")).toBe("dialog");
    fireEvent.click(gear);
    expect(screen.getByRole("dialog", { name: "Einstellungen" })).toBeTruthy();
    expect(
      screen.getByRole("radio", { name: "Dunkel (Werkstatt)" }),
    ).toHaveProperty("checked", true);
    fireEvent.click(screen.getByRole("radio", { name: "Hell (Pergament)" }));
    expect(root.dataset["dmTheme"]).toBe("parchment");
    expect(storage.getItem("dm.theme")).toBe("light");
    fireEvent.click(
      screen.getByRole("radio", { name: "Wie das Betriebssystem" }),
    );
    expect(root.dataset["dmTheme"]).toBe("system");
  });

  it("opens the settings with Cmd/Ctrl+, and closes them with Escape, focus back on the gear", () => {
    setup();
    const gear = screen.getByRole("button", { name: "Einstellungen" });
    fireEvent.keyDown(window, { key: ",", metaKey: true });
    const dialog = screen.getByRole("dialog", { name: "Einstellungen" });
    expect(dialog.contains(document.activeElement)).toBe(true);
    fireEvent.keyDown(document.activeElement ?? dialog, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(gear);
    fireEvent.keyDown(window, { key: ",", ctrlKey: true });
    expect(screen.getByRole("dialog", { name: "Einstellungen" })).toBeTruthy();
  });

  it("does not toggle the data panel behind the open settings", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Einstellungen" }));
    const radio = screen.getByRole("radio", { name: "Dunkel (Werkstatt)" });
    fireEvent.keyDown(radio, { key: "b", ctrlKey: true });
    expect(panel().hidden).toBe(false);
  });

  it("switches soft fog edges and sets the fade duration, per device", () => {
    const { storage } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Einstellungen" }));
    fireEvent.click(screen.getByRole("tab", { name: "Nebel & Animation" }));
    const soft = screen.getByRole("switch", { name: "Weiche Kanten" });
    expect((soft as HTMLInputElement).checked).toBe(true);
    fireEvent.click(soft);
    expect((soft as HTMLInputElement).checked).toBe(false);
    expect(storage.getItem("dm.fog.softEdges")).toBe("off");

    const fade = screen.getByRole("slider", { name: /Übergangsdauer/ });
    expect(fade.getAttribute("aria-valuetext")).toBe("0,65 s");
    fireEvent.change(fade, { target: { value: "1.5" } });
    expect(fade.getAttribute("aria-valuetext")).toBe("1,50 s");
    expect(storage.getItem("dm.fog.fadeSeconds")).toBe("1.5");
  });

  it("switches settings categories with the arrow keys", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Einstellungen" }));
    const appearance = screen.getByRole("tab", { name: "Darstellung" });
    expect(appearance.getAttribute("aria-selected")).toBe("true");
    appearance.focus();
    fireEvent.keyDown(appearance, { key: "ArrowDown" });
    const fog = screen.getByRole("tab", { name: "Nebel & Animation" });
    expect(fog.getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(fog);
    fireEvent.keyDown(fog, { key: "ArrowDown" });
    const library = screen.getByRole("tab", { name: "Bibliothek" });
    expect(library.getAttribute("aria-selected")).toBe("true");
    fireEvent.keyDown(library, { key: "End" });
    expect(
      screen
        .getByRole("tab", { name: "Werkzeugfenster" })
        .getAttribute("aria-selected"),
    ).toBe("true");
    expect(
      screen.getByRole("tabpanel", { name: "Werkzeugfenster" }),
    ).toBeTruthy();
    fireEvent.keyDown(document.activeElement ?? library, { key: "Home" });
    expect(
      screen.getByRole("radio", { name: "Dunkel (Werkstatt)" }),
    ).toBeTruthy();
  });

  it("keeps focus on the toggle when hiding a panel that had it", () => {
    setup();
    const inside = document.createElement("button");
    panel().append(inside);
    inside.focus();
    fireEvent.keyDown(inside, { key: "b", ctrlKey: true });
    expect(panel().hidden).toBe(true);
    expect(document.activeElement).toBe(toggle());
  });

  it("ignores the auto-repeat of a held Cmd/Ctrl+B", () => {
    setup();
    fireEvent.keyDown(window, { key: "b", ctrlKey: true });
    fireEvent.keyDown(window, { key: "b", ctrlKey: true, repeat: true });
    expect(panel().hidden).toBe(true);
  });

  it("resets remembered tool window positions from the settings", () => {
    const { storage } = setup();
    storage.setItem(
      "dm.hud.browser",
      JSON.stringify({ x: 300, y: 40, collapsed: true }),
    );
    storage.setItem("dm.theme", "light");
    fireEvent.click(screen.getByRole("button", { name: "Einstellungen" }));
    fireEvent.click(screen.getByRole("tab", { name: "Werkzeugfenster" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Positionen zurücksetzen" }),
    );
    expect(storage.getItem("dm.hud.browser")).toBeNull();
    // Other settings stay.
    expect(storage.getItem("dm.theme")).toBe("light");
  });

  it("sets the interface size from the settings", () => {
    const { storage, root } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Einstellungen" }));
    fireEvent.click(screen.getByRole("radio", { name: "125 %" }));
    expect(root.style.getPropertyValue("--dm-ui-scale")).toBe("1.25");
    expect(storage.getItem("dm.uiScale")).toBe("1.25");
  });
});
