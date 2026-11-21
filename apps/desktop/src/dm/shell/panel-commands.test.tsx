import { createDockview, type DockviewApi } from "dockview-react";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildDefaultLayout,
  canFold,
  dockPanel,
  floatPanel,
  foldedGroupIds,
  isFolded,
  restoreLayout,
  settleFolds,
  toggleFold,
} from "./panel-layout.js";

// The panel commands of T-172b on a real dockview with a fixed size.

const titles = {
  data: "Daten",
  map: "Karte",
  browser: "Browser",
  details: "Eigenschaften",
  initiative: "Initiative",
  preview: "TV-Vorschau",
};

/** The default layout in a real dockview of 1280 × 800 px (jsdom measures nothing itself). */
function defaultPanels(): DockviewApi {
  const element = document.createElement("div");
  document.body.append(element);
  const api = createDockview(element, {
    createComponent: () => ({
      element: document.createElement("div"),
      init: () => undefined,
    }),
  });
  api.layout(1280, 800);
  buildDefaultLayout(api, titles);
  return api;
}

afterEach(() => {
  document.body.replaceChildren();
});

const heightOf = (api: DockviewApi, id: string) =>
  api.getPanel(id)?.group.api.height ?? Number.NaN;
const widthOf = (api: DockviewApi, id: string) =>
  api.getPanel(id)?.group.api.width ?? Number.NaN;

describe("folding a panel to its title (T-172b)", () => {
  it("works only where a neighbour in the column takes the room", () => {
    const api = defaultPanels();
    expect(canFold(api, "browser")).toBe(true);
    expect(canFold(api, "details")).toBe(true);
    expect(canFold(api, "map")).toBe(false);
    expect(canFold(api, "data")).toBe(false);
    expect(toggleFold(api, "map")).toBeNull();
    expect(isFolded(api, "map")).toBe(false);
  });

  it("folds to the tab row and unfolds to the height it had", () => {
    const api = defaultPanels();
    const before = heightOf(api, "browser");
    expect(toggleFold(api, "browser")).toBe(true);
    expect(isFolded(api, "browser")).toBe(true);
    expect(heightOf(api, "browser")).toBeLessThan(40);
    expect(toggleFold(api, "browser")).toBe(false);
    expect(heightOf(api, "browser")).toBe(before);
  });

  it("stays folded when the window grows", () => {
    const api = defaultPanels();
    toggleFold(api, "browser");
    const folded = heightOf(api, "browser");
    api.layout(1600, 1000);
    settleFolds(api);
    expect(heightOf(api, "browser")).toBe(folded);
  });

  it("unfolds once its neighbour is gone", () => {
    const api = defaultPanels();
    toggleFold(api, "browser");
    // Alone in its column again: Eigenschaften (with the TV preview's tab) and Initiative go.
    api.getPanel("details")?.api.close();
    api.getPanel("preview")?.api.close();
    api.getPanel("initiative")?.api.close();
    expect(settleFolds(api)).toBe(true);
    expect(isFolded(api, "browser")).toBe(false);
    expect(heightOf(api, "browser")).toBe(800);
  });

  it("is folded again when the stored layout is restored", () => {
    const api = defaultPanels();
    toggleFold(api, "browser");
    const stored = api.toJSON();
    expect(foldedGroupIds(stored)).toEqual([api.getPanel("browser")?.group.id]);
    const restored = defaultPanels();
    restoreLayout(restored, stored, titles);
    expect(isFolded(restored, "browser")).toBe(true);
    expect(heightOf(restored, "browser")).toBeLessThan(40);
  });
});

describe("docking and floating by command (T-172b)", () => {
  it("docks a side panel at its default width, and the map at an equal share", () => {
    const api = defaultPanels();
    const dataWidth = widthOf(api, "data");
    dockPanel(api, "data", titles.data, "right");
    expect(widthOf(api, "data")).toBe(dataWidth);
    dockPanel(api, "map", titles.map, "left");
    // Never squeezed to a side panel's width (20 rem at jsdom's 14 px): an equal share at least.
    expect(widthOf(api, "map")).toBeGreaterThan(20 * 14);
    expect(widthOf(api, "map")).toBeGreaterThanOrEqual(1280 / 3 - 1);
  });

  it("docks a panel at the bottom across the window", () => {
    const api = defaultPanels();
    dockPanel(api, "details", titles.details, "bottom");
    expect(widthOf(api, "details")).toBe(1280);
    expect(heightOf(api, "details")).toBeLessThan(800 / 2);
  });

  it("lets a panel float, once", () => {
    const api = defaultPanels();
    floatPanel(api, "browser");
    expect(api.getPanel("browser")?.api.location.type).toBe("floating");
    floatPanel(api, "browser");
    expect(
      api.groups.filter((group) => group.api.location.type === "floating"),
    ).toHaveLength(1);
  });
});
