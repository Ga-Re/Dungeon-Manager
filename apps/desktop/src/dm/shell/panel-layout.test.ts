import { describe, expect, it } from "vitest";
import { memoryStorage } from "../memory-storage.test-data.js";
import { readLayout, saveLayout } from "./panel-layout.js";

// Stored panel layouts are device storage, an edge (T-172a): only what fits this app is used.

const panel = (id: string, component = id) => ({
  id,
  contentComponent: component,
  title: id,
});
const layout = {
  grid: { root: {}, width: 800, height: 600, orientation: "HORIZONTAL" },
  panels: { map: panel("map"), data: panel("data") },
  activeGroup: "1",
};

describe("stored panel layouts", () => {
  it("round-trip on this device", () => {
    const storage = memoryStorage();
    saveLayout(storage, layout);
    expect(readLayout(storage)).toEqual(layout);
  });

  it("are ignored when missing, unreadable or from another version", () => {
    expect(readLayout(memoryStorage())).toBeNull();
    expect(readLayout(memoryStorage({ "dm.layout": "{" }))).toBeNull();
    expect(
      readLayout(
        memoryStorage({ "dm.layout": JSON.stringify({ version: 2, layout }) }),
      ),
    ).toBeNull();
    expect(readLayout(undefined)).toBeNull();
  });

  it("are ignored when they name other panels or swap a panel's content", () => {
    const store = (panels: object) =>
      memoryStorage({
        "dm.layout": JSON.stringify({
          version: 1,
          layout: { ...layout, panels },
        }),
      });
    expect(
      readLayout(store({ ...layout.panels, chat: panel("chat") })),
    ).toBeNull();
    expect(readLayout(store({ data: panel("data", "map") }))).toBeNull();
  });

  it("never bring back a popout window", () => {
    const storage = memoryStorage({
      "dm.layout": JSON.stringify({
        version: 1,
        layout: { ...layout, popoutGroups: [{ url: "https://example.com" }] },
      }),
    });
    expect(readLayout(storage)).toEqual(layout);
  });

  it("are not kept when the storage refuses them", () => {
    const storage = memoryStorage();
    storage.setItem = () => {
      throw new Error("full");
    };
    expect(() => {
      saveLayout(storage, layout);
    }).not.toThrow();
  });
});
