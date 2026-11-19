import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { applyUiScale, readUiScale, useUiScale } from "./ui-scale.js";

function storageWith(value: string | null): Storage {
  const data = new Map<string, string>();
  if (value !== null) data.set("dm.uiScale", value);
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
    setItem: (key, item) => {
      data.set(key, item);
    },
  };
}

describe("interface size (T-162)", () => {
  it("reads a stored size and falls back to 100 % for anything else", () => {
    expect(readUiScale(storageWith("1.25"))).toBe(1.25);
    expect(readUiScale(storageWith(null))).toBe(1);
    expect(readUiScale(storageWith("3"))).toBe(1);
    expect(readUiScale(undefined)).toBe(1);
  });

  it("applies the size as the root's --dm-ui-scale and stores it", () => {
    const storage = storageWith(null);
    const root = document.createElement("html");
    const { result } = renderHook(() => useUiScale(storage, root));
    act(() => {
      result.current[1](0.9);
    });
    expect(root.style.getPropertyValue("--dm-ui-scale")).toBe("0.9");
    expect(storage.getItem("dm.uiScale")).toBe("0.9");
    expect(result.current[0]).toBe(0.9);
    applyUiScale(1.1, root);
    expect(root.style.getPropertyValue("--dm-ui-scale")).toBe("1.1");
  });
});
