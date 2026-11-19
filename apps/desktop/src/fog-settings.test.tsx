import { describe, expect, it, vi } from "vitest";
import { memoryStorage } from "./dm/memory-storage.test-data.js";
import {
  onSoftEdgesChange,
  readSoftEdges,
  saveSoftEdges,
  softEdgeWidth,
} from "./fog-settings.js";

describe("fog settings", () => {
  it("has soft edges on by default and remembers the choice per device", () => {
    const storage = memoryStorage();
    expect(readSoftEdges(storage)).toBe(true);
    saveSoftEdges(storage, false);
    expect(readSoftEdges(storage)).toBe(false);
    saveSoftEdges(storage, true);
    expect(readSoftEdges(storage)).toBe(true);
  });

  it("falls back to on for unknown values or unavailable storage", () => {
    expect(readSoftEdges(memoryStorage({ "dm.fog.softEdges": "maybe" }))).toBe(
      true,
    );
    expect(readSoftEdges(undefined)).toBe(true);
    const failing = memoryStorage();
    failing.getItem = () => {
      throw new Error("denied");
    };
    failing.setItem = () => {
      throw new Error("denied");
    };
    expect(readSoftEdges(failing)).toBe(true);
    expect(() => {
      saveSoftEdges(failing, false);
    }).not.toThrow();
  });

  it("makes the edge a share of a grid cell, or none when off", () => {
    expect(softEdgeWidth(100, true)).toBe(25);
    expect(softEdgeWidth(100, false)).toBe(0);
  });

  it("hears a change made in the other window", () => {
    const listener = vi.fn();
    const stop = onSoftEdgesChange(listener);
    window.dispatchEvent(
      new StorageEvent("storage", { key: "dm.fog.softEdges", newValue: "off" }),
    );
    window.dispatchEvent(
      new StorageEvent("storage", { key: "dm.theme", newValue: "light" }),
    );
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(false);
    stop();
    window.dispatchEvent(
      new StorageEvent("storage", { key: "dm.fog.softEdges", newValue: "on" }),
    );
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
