import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useHudLayoutStore } from "./hud-layout.js";

function memoryStorage(initial: Record<string, string> = {}): Storage {
  const data = new Map(Object.entries(initial));
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

const FALLBACK = { x: 12, y: 12, collapsed: false };

describe("useHudLayoutStore", () => {
  it("reads a stored placement and ignores anything malformed", () => {
    const storage = memoryStorage({
      "dm.hud.ok": JSON.stringify({ x: 40, y: 50, collapsed: true }),
      "dm.hud.garbage": "{nope",
      "dm.hud.infinite": JSON.stringify({ x: null, y: 1, collapsed: false }),
      "dm.hud.partial": JSON.stringify({ x: 1, y: 2 }),
    });
    const { result } = renderHook(() => useHudLayoutStore(storage));
    expect(result.current.get("ok", FALLBACK)).toEqual({
      x: 40,
      y: 50,
      collapsed: true,
    });
    for (const id of ["garbage", "infinite", "partial", "missing"])
      expect(result.current.get(id, FALLBACK)).toEqual(FALLBACK);
  });

  it("stores a placement and keeps it in memory when storage refuses", () => {
    const storage = memoryStorage();
    storage.setItem = () => {
      throw new Error("QuotaExceededError");
    };
    const { result } = renderHook(() => useHudLayoutStore(storage));
    act(() => {
      result.current.set("browser", { x: 5, y: 6, collapsed: false });
    });
    expect(result.current.get("browser", FALLBACK)).toEqual({
      x: 5,
      y: 6,
      collapsed: false,
    });
  });

  it("reset forgets stored and in-memory placements, nothing else", () => {
    const storage = memoryStorage({ "dm.theme": "light" });
    const { result } = renderHook(() => useHudLayoutStore(storage));
    act(() => {
      result.current.set("browser", { x: 5, y: 6, collapsed: true });
    });
    expect(storage.getItem("dm.hud.browser")).not.toBeNull();
    act(() => {
      result.current.reset();
    });
    expect(result.current.get("browser", FALLBACK)).toEqual(FALLBACK);
    expect(storage.getItem("dm.hud.browser")).toBeNull();
    expect(storage.getItem("dm.theme")).toBe("light");
  });
});
