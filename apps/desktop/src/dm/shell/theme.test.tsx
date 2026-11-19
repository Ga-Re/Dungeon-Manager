import { describe, expect, it } from "vitest";
import { applyTheme, readThemeSetting } from "./theme.js";

function storageWith(value: string | null): Storage {
  const data = new Map<string, string>();
  if (value !== null) data.set("dm.theme", value);
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

describe("readThemeSetting", () => {
  it("defaults to parchment (light) without a stored choice", () => {
    expect(readThemeSetting(storageWith(null))).toBe("light");
    expect(readThemeSetting(undefined)).toBe("light");
  });

  it("returns a stored choice and ignores unknown values", () => {
    expect(readThemeSetting(storageWith("system"))).toBe("system");
    expect(readThemeSetting(storageWith("dark"))).toBe("dark");
    expect(readThemeSetting(storageWith("purple"))).toBe("light");
  });

  it("falls back to the default when storage is unavailable", () => {
    const broken = storageWith(null);
    broken.getItem = () => {
      throw new Error("SecurityError");
    };
    expect(readThemeSetting(broken)).toBe("light");
  });
});

describe("applyTheme", () => {
  it("maps the setting to the token sheet's theme attribute", () => {
    const root = document.createElement("html");
    applyTheme("light", root);
    expect(root.dataset["dmTheme"]).toBe("parchment");
    applyTheme("dark", root);
    expect(root.dataset["dmTheme"]).toBe("night");
    applyTheme("system", root);
    expect(root.dataset["dmTheme"]).toBe("system");
  });
});
