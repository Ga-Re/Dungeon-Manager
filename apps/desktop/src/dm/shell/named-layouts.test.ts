import { describe, expect, it } from "vitest";
import { memoryStorage } from "../memory-storage.test-data.js";
import {
  layoutNameProblem,
  readNamedLayouts,
  removeNamedLayout,
  renameNamedLayout,
  saveNamedLayout,
  writeNamedLayouts,
  type NamedLayout,
} from "./named-layouts.js";

// Named layouts (T-172c): the DM's own panel layouts per workspace, stored on this device.

const panel = (id: string) => ({ id, contentComponent: id, title: id });
const layout = (width = 800) => ({
  grid: { root: {}, width, height: 600, orientation: "HORIZONTAL" },
  panels: { map: panel("map"), data: panel("data") },
  activeGroup: "1",
});
const fight: NamedLayout = { id: "a", name: "Kampf", layout: layout() };
const explore: NamedLayout = {
  id: "b",
  name: "Erkundung",
  layout: layout(900),
};

describe("named layouts", () => {
  it("are kept per workspace and survive a restart", () => {
    const storage = memoryStorage();
    writeNamedLayouts(storage, "gameOrchestrator", [fight, explore]);
    writeNamedLayouts(storage, "mapForge", [explore]);
    expect(readNamedLayouts(storage, "gameOrchestrator")).toEqual([
      fight,
      explore,
    ]);
    expect(readNamedLayouts(storage, "mapForge")).toEqual([explore]);
    expect(readNamedLayouts(storage, "campaignAtlas")).toEqual([]);
  });

  it("drop what this app cannot use: other versions, broken entries, foreign panels", () => {
    expect(readNamedLayouts(memoryStorage(), "mapForge")).toEqual([]);
    expect(
      readNamedLayouts(memoryStorage({ "dm.layouts": "{" }), "mapForge"),
    ).toEqual([]);
    const stored = (version: number, entries: unknown[]) =>
      memoryStorage({
        "dm.layouts": JSON.stringify({
          version,
          workspaces: { mapForge: entries },
        }),
      });
    expect(readNamedLayouts(stored(2, [fight]), "mapForge")).toEqual([]);
    const foreign = {
      id: "c",
      name: "Chat",
      layout: { ...layout(), panels: { chat: panel("chat") } },
    };
    expect(
      readNamedLayouts(
        stored(1, [fight, foreign, { id: "d" }, "x", { ...explore, name: "" }]),
        "mapForge",
      ),
    ).toEqual([fight]);
    expect(readNamedLayouts(undefined, "mapForge")).toEqual([]);
  });

  it("are not kept when the storage refuses them", () => {
    const storage = memoryStorage();
    storage.setItem = () => {
      throw new Error("full");
    };
    expect(() => {
      writeNamedLayouts(storage, "mapForge", [fight]);
    }).not.toThrow();
  });

  it("are saved under a new name, or replace the one of the same name", () => {
    const saved = saveNamedLayout([fight], "Erkundung", layout(900), "b");
    expect(saved).toEqual([fight, explore]);
    // The same name, written differently: the layout is replaced, its place and id stay.
    expect(saveNamedLayout(saved, "  kampf ", layout(1000), "z")).toEqual([
      { id: "a", name: "kampf", layout: layout(1000) },
      explore,
    ]);
  });

  it("are renamed and removed", () => {
    expect(renameNamedLayout([fight, explore], "a", " Gefecht ")).toEqual([
      { ...fight, name: "Gefecht" },
      explore,
    ]);
    expect(removeNamedLayout([fight, explore], "a")).toEqual([explore]);
  });

  it("need a name of their own", () => {
    const layouts = [fight, explore];
    expect(layoutNameProblem(layouts, "  ")).toBe("empty");
    expect(layoutNameProblem(layouts, "x".repeat(41))).toBe("tooLong");
    expect(layoutNameProblem(layouts, "Patrouille")).toBeNull();
    // Saving under a taken name replaces it; renaming onto another one does not.
    expect(layoutNameProblem(layouts, "KAMPF")).toBeNull();
    expect(layoutNameProblem(layouts, "kampf", "b")).toBe("taken");
    expect(layoutNameProblem(layouts, "kampf", "a")).toBeNull();
  });
});
