import { createI18n } from "@dungeon-manager/ui";
import {
  act,
  cleanup,
  fireEvent,
  render,
  waitFor,
  screen,
  within,
} from "@testing-library/react";
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
        <ShellPortal slot="command">
          <div data-testid="command" />
        </ShellPortal>
      </DmShell>
    </I18nextProvider>,
  );
  return { storage, root };
}

const toggle = () =>
  screen.getByRole("button", { name: /Daten ein- oder ausblenden/ });
/** The data panel's content; it leaves the document while the panel is hidden (T-172a). */
const dataContent = () =>
  document.querySelector<HTMLElement>(".dm-datapanel-content");
/** A hidden panel is closed in the layout; its content stays alive outside the document. */
const panel = () => ({ hidden: dataContent() === null });

const workspaceMenu = () =>
  within(screen.getByRole("group", { name: "Arbeitsbereich" })).getByRole(
    "button",
  );

describe("DmShell", () => {
  it("starts in the Game-Orchestrator with its tabs", () => {
    setup();
    expect(workspaceMenu().textContent).toBe("Game-Orchestrator");
    expect(
      within(screen.getByRole("tablist", { name: "Werkzeugleisten" }))
        .getAllByRole("tab")
        .map((tab) => tab.textContent),
    ).toEqual(["Szene", "Nebel", "Anzeige"]);
  });

  it("switches the workspace from its menu, keeps the Game-Orchestrator's tools and remembers it", () => {
    const { storage } = setup();
    fireEvent.click(screen.getByRole("tab", { name: "Nebel" }));
    const tool = screen.getByRole("button", { name: "Aufdecken" });

    fireEvent.click(workspaceMenu());
    expect(
      within(screen.getByRole("menu", { name: "Arbeitsbereich" }))
        .getAllByRole("menuitemradio")
        .map((item) => [item.textContent, item.getAttribute("aria-checked")]),
    ).toEqual([
      ["Map Forge", "false"],
      ["Asset Vault", "false"],
      ["Tokens & Kreaturen", "false"],
      ["Campaign Atlas", "false"],
      ["Game-Orchestrator", "true"],
    ]);
    fireEvent.click(screen.getByRole("menuitemradio", { name: "Map Forge" }));

    expect(workspaceMenu().textContent).toBe("Map Forge");
    // The Map Forge has its own ribbon tabs (ADR-0020, T-252, T-254): KARTE and BEREICHE.
    const forgeTabs = screen.getByRole("tablist", { name: "Werkzeugleisten" });
    expect(
      within(forgeTabs)
        .getAllByRole("tab")
        .map((tab) => [tab.textContent, tab.getAttribute("aria-selected")]),
    ).toEqual([
      ["Karte", "true"],
      ["Bereiche", "false"],
    ]);
    expect(screen.queryByRole("button", { name: "Aufdecken" })).toBeNull();
    expect(storage.getItem("dm.workspace")).toBe("mapForge");

    // A workspace without tools yet says what is coming instead of tabs.
    fireEvent.click(workspaceMenu());
    fireEvent.click(screen.getByRole("menuitemradio", { name: "Asset Vault" }));
    expect(
      screen.queryByRole("tablist", { name: "Werkzeugleisten" }),
    ).toBeNull();
    expect(
      screen.getByText(
        "Hier verwaltest du bald Requisiten, Handouts und Sounds.",
      ),
    ).toBeTruthy();

    fireEvent.click(workspaceMenu());
    fireEvent.click(
      screen.getByRole("menuitemradio", { name: "Game-Orchestrator" }),
    );
    // The same tool, not a new one: tools keep their state across workspaces.
    expect(screen.getByRole("button", { name: "Aufdecken" })).toBe(tool);
    expect(
      screen.getByRole("tab", { name: "Nebel" }).getAttribute("aria-selected"),
    ).toBe("true");
  });

  it("opens a workspace remembered under its name before T-171", () => {
    const storage = memoryStorage();
    storage.setItem("dm.workspace", "assetStudio");
    setup(storage);
    expect(workspaceMenu().textContent).toBe("Asset Vault");
    expect(
      screen.getByText(
        "Hier verwaltest du bald Requisiten, Handouts und Sounds.",
      ),
    ).toBeTruthy();
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

  it("puts a ribbon tool's command panel above all panels, not in the map's (T-257)", () => {
    setup();
    const command = screen.getByTestId("command");
    const layer = command.closest(".dm-command-layer");
    // One layer over the whole window, outside dockview's panels.
    expect(layer?.parentElement?.classList.contains("dm-shell")).toBe(true);
    expect(command.closest(".dm-panels")).toBeNull();
    expect(command.closest(".dm-stage")).toBeNull();
  });

  it("renders portalled parts into their zones", () => {
    setup();
    expect(screen.getByTestId("map").closest(".dm-canvas")).not.toBeNull();
    const data = dataContent();
    if (!data) throw new Error("data panel missing");
    expect(within(data).getByText("Bibliotheksinhalt")).toBeTruthy();
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
    // The living fog (on by default) always has soft edges.
    expect((soft as HTMLInputElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("radio", { name: "Aus" }));
    expect((soft as HTMLInputElement).disabled).toBe(false);
    expect((soft as HTMLInputElement).checked).toBe(true);
    fireEvent.click(soft);
    expect((soft as HTMLInputElement).checked).toBe(false);
    expect(storage.getItem("dm.fog.softEdges")).toBe("off");

    const fade = screen.getByRole("slider", { name: "Übergang" });
    expect(fade.getAttribute("aria-valuetext")).toBe("0,65 s");
    fireEvent.change(fade, { target: { value: "1.5" } });
    expect(fade.getAttribute("aria-valuetext")).toBe("1,50 s");
    expect(storage.getItem("dm.fog.fadeSeconds")).toBe("1.5");
  });

  it("sets the living fog's quality, edge wobble and movement, per device", () => {
    const { storage } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Einstellungen" }));
    fireEvent.click(screen.getByRole("tab", { name: "Nebel & Animation" }));
    const medium = screen.getByRole("radio", { name: "Mittel" });
    expect((medium as HTMLInputElement).checked).toBe(true);
    fireEvent.click(screen.getByRole("radio", { name: "Hoch" }));
    expect(storage.getItem("dm.fog.quality")).toBe("high");

    const edge = screen.getByRole("slider", { name: "Randwabern" });
    expect(edge.getAttribute("aria-valuetext")).toBe("1,2×");
    fireEvent.change(edge, { target: { value: "2" } });
    expect(edge.getAttribute("aria-valuetext")).toBe("2,0×");
    expect(storage.getItem("dm.fog.edge")).toBe("2");

    const motion = screen.getByRole("slider", { name: "Bewegung" });
    fireEvent.change(motion, { target: { value: "0" } });
    expect(storage.getItem("dm.fog.motion")).toBe("0");

    // Without living fog there is nothing to wobble or move.
    fireEvent.click(screen.getByRole("radio", { name: "Aus" }));
    expect(storage.getItem("dm.fog.quality")).toBe("off");
    expect((edge as HTMLInputElement).disabled).toBe(true);
    expect((motion as HTMLInputElement).disabled).toBe(true);
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
      screen.getByRole("tab", { name: "Panels" }).getAttribute("aria-selected"),
    ).toBe("true");
    expect(screen.getByRole("tabpanel", { name: "Panels" })).toBeTruthy();
    fireEvent.keyDown(document.activeElement ?? library, { key: "Home" });
    expect(
      screen.getByRole("radio", { name: "Dunkel (Werkstatt)" }),
    ).toBeTruthy();
  });

  it("keeps focus on the toggle when hiding a panel that had it", () => {
    setup();
    const inside = document.createElement("button");
    dataContent()?.append(inside);
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

  it("resets the panel layout from the settings (T-172a)", () => {
    const { storage } = setup();
    fireEvent.keyDown(window, { key: "b", ctrlKey: true });
    expect(panel().hidden).toBe(true);
    storage.setItem("dm.theme", "light");
    fireEvent.click(screen.getByRole("button", { name: "Einstellungen" }));
    fireEvent.click(screen.getByRole("tab", { name: "Panels" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Layout zurücksetzen" }),
    );
    expect(panel().hidden).toBe(false);
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

  describe("panels (T-172a)", () => {
    const viewItem = (name: string) => {
      fireEvent.click(screen.getByRole("button", { name: "Menü" }));
      return screen.getByRole("menuitemcheckbox", { name });
    };

    it("starts with the default layout: Daten, Karte, Browser, Eigenschaften, Initiative, TV-Vorschau", () => {
      setup();
      fireEvent.click(screen.getByRole("button", { name: "Menü" }));
      expect(
        screen
          .getAllByRole("menuitemcheckbox")
          .map((item) => [item.textContent, item.getAttribute("aria-checked")]),
      ).toEqual([
        ["Daten", "true"],
        ["Karte", "true"],
        ["Browser", "true"],
        ["Eigenschaften", "true"],
        ["Initiative", "true"],
        ["TV-Vorschau", "true"],
      ]);
    });

    it("hides and shows a panel from the View menu; its content stays alive", () => {
      setup();
      const map = screen.getByTestId("map");
      fireEvent.click(viewItem("Karte"));
      expect(screen.queryByTestId("map")).toBeNull();
      expect(viewItem("Karte").getAttribute("aria-checked")).toBe("false");
      fireEvent.click(screen.getByRole("menuitemcheckbox", { name: "Karte" }));
      // The very same element: what renders into the map was never unmounted.
      expect(screen.getByTestId("map")).toBe(map);
    });

    it("makes the map the Map Forge's canvas: no tab, never hidden or moved (T-258)", () => {
      setup();
      // Hidden in the Game-Orchestrator …
      fireEvent.click(viewItem("Karte"));
      expect(screen.queryByTestId("map")).toBeNull();
      fireEvent.click(workspaceMenu());
      fireEvent.click(screen.getByRole("menuitemradio", { name: "Map Forge" }));
      // … the Map Forge shows it again, as its canvas: no tab, no panel menu.
      const map = screen.getByTestId("map");
      const group = map.closest<HTMLElement>(".dv-groupview");
      expect(group?.querySelector(".dv-tabs-and-actions-container")).toSatisfy(
        (header: HTMLElement | null) =>
          header === null ||
          header.classList.contains("dv-hidden") ||
          header.style.display === "none",
      );
      expect(screen.queryByRole("button", { name: "Panel Karte" })).toBeNull();
      // The View menu cannot hide it here.
      const item = viewItem("Karte");
      expect(item.getAttribute("aria-disabled")).toBe("true");
      fireEvent.click(item);
      expect(screen.getByTestId("map")).toBe(map);
      fireEvent.keyDown(document.activeElement ?? document.body, {
        key: "Escape",
      });

      // Back in the Game-Orchestrator it is a panel like the others again.
      fireEvent.click(workspaceMenu());
      fireEvent.click(
        screen.getByRole("menuitemradio", { name: "Game-Orchestrator" }),
      );
      expect(screen.getByRole("button", { name: "Panel Karte" })).toBeTruthy();
      expect(viewItem("Karte").getAttribute("aria-disabled")).not.toBe("true");
    });

    it("folds a panel into an edge sidebar that slides it out over the map (T-259)", async () => {
      const storage = memoryStorage();
      setup(storage);
      const content = dataContent();
      fireEvent.click(screen.getByRole("button", { name: "Panel Daten" }));
      fireEvent.click(
        screen.getByRole("menuitem", { name: "Automatisch ausblenden" }),
      );
      // Out of the layout, a vertical tab in the left sidebar (it was left of the map).
      expect(screen.queryByRole("button", { name: "Panel Daten" })).toBeNull();
      const bar = screen.getByRole("group", { name: "Linke Seitenleiste" });
      const tab = within(bar).getByRole("button", { name: "Daten" });
      expect(tab.getAttribute("aria-expanded")).toBe("false");
      const sheet = () =>
        document.querySelector<HTMLElement>('.dm-edge-sheet[data-edge="left"]');
      expect(sheet()?.dataset["open"]).toBeUndefined();

      // A click slides it out, with its very content.
      fireEvent.click(tab);
      expect(tab.getAttribute("aria-expanded")).toBe("true");
      expect(sheet()?.dataset["open"]).toBe("true");
      expect(sheet()?.contains(content)).toBe(true);
      // Escape slides it back and returns to its tab.
      fireEvent.keyDown(
        within(sheet() as HTMLElement).getByText("Bibliotheksinhalt"),
        {
          key: "Escape",
        },
      );
      await waitFor(() => {
        expect(sheet()?.dataset["open"]).toBeUndefined();
      });
      expect(document.activeElement).toBe(tab);
      // A press elsewhere slides it back too.
      fireEvent.click(tab);
      fireEvent.pointerDown(screen.getByTestId("map"));
      expect(sheet()?.dataset["open"]).toBeUndefined();

      // Kept on this device.
      expect(JSON.parse(storage.getItem("dm.edgePanels") ?? "null")).toEqual({
        left: ["data"],
        right: [],
      });

      // Pinned, it docks again.
      fireEvent.click(tab);
      fireEvent.click(screen.getByRole("button", { name: "Daten anheften" }));
      expect(
        screen.queryByRole("group", { name: "Linke Seitenleiste" }),
      ).toBeNull();
      expect(screen.getByRole("button", { name: "Panel Daten" })).toBeTruthy();
      expect(dataContent()).toBe(content);
    });

    it("keeps edge sidebars across a restart (T-259)", () => {
      const storage = memoryStorage();
      storage.setItem(
        "dm.edgePanels",
        JSON.stringify({ left: [], right: ["browser", "map", "nope"] }),
      );
      setup(storage);
      // Only real panels, never the map.
      const bar = screen.getByRole("group", { name: "Rechte Seitenleiste" });
      expect(
        within(bar)
          .getAllByRole("button")
          .map((button) => button.textContent),
      ).toEqual(["Browser"]);
      expect(
        screen.queryByRole("button", { name: "Panel Browser" }),
      ).toBeNull();
    });

    it("keeps the layout on this device across a restart", () => {
      const storage = memoryStorage();
      setup(storage);
      fireEvent.click(viewItem("Browser"));
      cleanup();
      setup(storage);
      expect(viewItem("Browser").getAttribute("aria-checked")).toBe("false");
      expect(
        screen
          .getByRole("menuitemcheckbox", { name: "Daten" })
          .getAttribute("aria-checked"),
      ).toBe("true");
    });

    it("falls back to the default layout when the stored one cannot be used", () => {
      const storage = memoryStorage();
      storage.setItem(
        "dm.layout",
        JSON.stringify({ version: 1, layout: { grid: "broken" } }),
      );
      setup(storage);
      expect(panel().hidden).toBe(false);
      expect(viewItem("Eigenschaften").getAttribute("aria-checked")).toBe(
        "true",
      );
    });
  });

  describe("panel menus (T-172b)", () => {
    const panelMenu = (title: string) =>
      screen.getByRole("button", { name: `Panel ${title}` });

    it("offer docking, floating, folding and hiding for each panel", () => {
      setup();
      fireEvent.click(panelMenu("Karte"));
      expect(
        screen
          .getAllByRole("menuitem")
          .map((item) => [
            item.textContent,
            item.getAttribute("aria-disabled") === "true",
          ]),
      ).toEqual([
        ["Links andocken", false],
        ["Rechts andocken", false],
        ["Unten andocken", false],
        ["Schwebend", false],
        // The map has no neighbour above or below to give the room to.
        ["Einklappen", true],
        ["Ausblenden", false],
      ]);
    });

    it("dock a panel elsewhere, keep its content and say so", async () => {
      setup();
      const map = screen.getByTestId("map");
      fireEvent.click(panelMenu("Karte"));
      fireEvent.click(
        screen.getByRole("menuitem", { name: "Rechts andocken" }),
      );
      expect(screen.getByTestId("map")).toBe(map);
      expect(
        await screen.findByText("Karte rechts angedockt", {
          selector: '[role="status"]',
        }),
      ).toBeTruthy();
    });

    it("hide a panel from its menu or its tab's close button", () => {
      setup();
      fireEvent.click(panelMenu("Browser"));
      fireEvent.click(screen.getByRole("menuitem", { name: "Ausblenden" }));
      expect(
        screen.queryByRole("button", { name: "Panel Browser" }),
      ).toBeNull();
      fireEvent.click(
        screen.getByRole("button", { name: "Eigenschaften ausblenden" }),
      );
      expect(
        screen.queryByRole("button", { name: "Panel Eigenschaften" }),
      ).toBeNull();
      fireEvent.click(screen.getByRole("button", { name: "Menü" }));
      expect(
        screen
          .getByRole("menuitemcheckbox", { name: "Eigenschaften" })
          .getAttribute("aria-checked"),
      ).toBe("false");
    });
  });

  describe("named layouts (T-172c)", () => {
    const openMenu = () => {
      fireEvent.click(screen.getByRole("button", { name: "Menü" }));
    };
    const shown = (name: string) => {
      openMenu();
      const checked = screen
        .getByRole("menuitemcheckbox", { name })
        .getAttribute("aria-checked");
      fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });
      return checked === "true";
    };
    const toggleView = (name: string) => {
      openMenu();
      fireEvent.click(screen.getByRole("menuitemcheckbox", { name }));
    };
    const panelSettings = () => {
      fireEvent.click(screen.getByRole("button", { name: "Einstellungen" }));
      fireEvent.click(screen.getByRole("tab", { name: "Panels" }));
      return within(
        screen.getByRole("group", { name: "Gespeicherte Layouts" }),
      );
    };
    const closeSettings = () => {
      fireEvent.click(
        screen.getByRole("button", { name: "Einstellungen schließen" }),
      );
    };
    /** Submits a name form; it is ready again once its (async) submit has settled. */
    const submit = async (button: HTMLElement) => {
      fireEvent.click(button);
      await act(() => Promise.resolve());
    };
    const saveAs = async (
      settings: ReturnType<typeof panelSettings>,
      name: string,
    ) => {
      fireEvent.change(settings.getByLabelText("Name des Layouts"), {
        target: { value: name },
      });
      await submit(settings.getByRole("button", { name: "Speichern" }));
    };

    it("saves the layout under a name, switches to it from the View menu and keeps it on this device", async () => {
      const storage = memoryStorage();
      setup(storage);
      toggleView("Browser");
      const settings = panelSettings();
      expect(
        settings.getByText("Noch keine Layouts gespeichert."),
      ).toBeTruthy();
      await saveAs(settings, " Kampf ");
      expect(settings.getByText("Kampf")).toBeTruthy();
      closeSettings();

      toggleView("Browser");
      expect(shown("Browser")).toBe(true);
      openMenu();
      fireEvent.click(screen.getByRole("menuitem", { name: "Layout „Kampf“" }));
      expect(shown("Browser")).toBe(false);
      expect(await screen.findByText("Layout „Kampf“ angewendet")).toBeTruthy();

      cleanup();
      setup(storage);
      openMenu();
      expect(
        screen.getByRole("menuitem", { name: "Layout „Kampf“" }),
      ).toBeTruthy();
    });

    it("keeps named layouts per workspace", async () => {
      setup();
      await saveAs(panelSettings(), "Kampf");
      closeSettings();
      fireEvent.click(workspaceMenu());
      fireEvent.click(screen.getByRole("menuitemradio", { name: "Map Forge" }));
      openMenu();
      expect(
        screen.queryByRole("menuitem", { name: "Layout „Kampf“" }),
      ).toBeNull();
    });

    it("renames and deletes them; a name must be its own and short enough", async () => {
      setup();
      const settings = panelSettings();
      await saveAs(settings, "Kampf");
      await saveAs(settings, "Erkundung");
      await saveAs(settings, "x".repeat(41));
      expect(settings.getByRole("alert").textContent).toBe(
        "Der Name ist zu lang (höchstens 40 Zeichen).",
      );

      fireEvent.click(
        settings.getByRole("button", { name: "Erkundung umbenennen" }),
      );
      const field = settings.getByDisplayValue("Erkundung");
      fireEvent.change(field, { target: { value: "kampf" } });
      await submit(settings.getByRole("button", { name: "Umbenennen" }));
      const row = within(field.closest("li") ?? document.body);
      expect(row.getByRole("alert").textContent).toBe(
        "Ein anderes Layout heißt schon so.",
      );
      fireEvent.change(field, { target: { value: "Patrouille" } });
      await submit(settings.getByRole("button", { name: "Umbenennen" }));
      expect(settings.getByText("Patrouille")).toBeTruthy();
      expect(
        await screen.findByText("Layout „Erkundung“ heißt jetzt „Patrouille“"),
      ).toBeTruthy();
      // Renaming can be left without a change.
      fireEvent.click(
        settings.getByRole("button", { name: "Patrouille umbenennen" }),
      );
      fireEvent.click(settings.getByRole("button", { name: "Abbrechen" }));
      expect(settings.queryByDisplayValue("Patrouille")).toBeNull();
      // The keyboard stays on the row it renamed.
      expect(document.activeElement).toBe(
        settings.getByRole("button", { name: "Patrouille umbenennen" }),
      );

      fireEvent.click(settings.getByRole("button", { name: "Kampf löschen" }));
      expect(settings.queryByText("Kampf")).toBeNull();
      expect(await screen.findByText("Layout „Kampf“ gelöscht")).toBeTruthy();
      expect(document.activeElement).toBe(
        settings.getByLabelText("Name des Layouts"),
      );
    });

    it("saves the layout from the View menu, in a dialog", async () => {
      setup();
      openMenu();
      fireEvent.click(
        screen.getByRole("menuitem", { name: "Layout speichern …" }),
      );
      const dialog = within(
        screen.getByRole("dialog", { name: "Layout speichern" }),
      );
      fireEvent.change(dialog.getByLabelText("Name des Layouts"), {
        target: { value: "Erkundung" },
      });
      await submit(dialog.getByRole("button", { name: "Speichern" }));
      expect(
        screen.queryByRole("dialog", { name: "Layout speichern" }),
      ).toBeNull();
      openMenu();
      expect(
        screen.getByRole("menuitem", { name: "Layout „Erkundung“" }),
      ).toBeTruthy();
    });
  });
});
