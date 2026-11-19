import { describe, expect, it, vi } from "vitest";
import { memoryStorage } from "./dm/memory-storage.test-data.js";
import {
  onFogLookChange,
  readFadeSeconds,
  readSoftEdges,
  saveFadeSeconds,
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

  it("keeps the fade duration within 0 to 3 s on the slider's steps", () => {
    const storage = memoryStorage();
    expect(readFadeSeconds(storage)).toBe(0.65);
    saveFadeSeconds(storage, 0);
    expect(readFadeSeconds(storage)).toBe(0);
    saveFadeSeconds(storage, 1.234);
    expect(readFadeSeconds(storage)).toBe(1.25);
    expect(storage.getItem("dm.fog.fadeSeconds")).toBe("1.25");
    saveFadeSeconds(storage, 9);
    expect(readFadeSeconds(storage)).toBe(3);
    expect(readFadeSeconds(memoryStorage({ "dm.fog.fadeSeconds": "x" }))).toBe(
      0.65,
    );
    expect(readFadeSeconds(memoryStorage({ "dm.fog.fadeSeconds": "-2" }))).toBe(
      0,
    );
  });

  it("hears a change made in the other window", () => {
    const storage = memoryStorage();
    const listener = vi.fn();
    const stop = onFogLookChange(storage, listener);
    storage.setItem("dm.fog.softEdges", "off");
    window.dispatchEvent(
      new StorageEvent("storage", { key: "dm.fog.softEdges", newValue: "off" }),
    );
    storage.setItem("dm.fog.fadeSeconds", "2");
    window.dispatchEvent(
      new StorageEvent("storage", { key: "dm.fog.fadeSeconds", newValue: "2" }),
    );
    window.dispatchEvent(
      new StorageEvent("storage", { key: "dm.theme", newValue: "light" }),
    );
    expect(listener.mock.calls).toEqual([
      [{ softEdges: false, fadeSeconds: 0.65 }],
      [{ softEdges: false, fadeSeconds: 2 }],
    ]);
    stop();
    window.dispatchEvent(
      new StorageEvent("storage", { key: "dm.fog.softEdges", newValue: "on" }),
    );
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
