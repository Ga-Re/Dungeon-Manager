import { describe, expect, it } from "vitest";
import { memoryStorage } from "../memory-storage.test-data.js";
import { WORKSPACES, readWorkspace, saveWorkspace } from "./workspace.js";

describe("workspace", () => {
  it("has the four workspaces of the DM's decision, Game Mode last", () => {
    expect(WORKSPACES).toEqual([
      "mapForge",
      "assetStudio",
      "campaignAtlas",
      "gameMode",
    ]);
  });

  it("starts in Game Mode and then in the last one used on this device", () => {
    const storage = memoryStorage();
    expect(readWorkspace(storage)).toBe("gameMode");
    saveWorkspace(storage, "mapForge");
    expect(readWorkspace(storage)).toBe("mapForge");
  });

  it("falls back to Game Mode for unknown values or unavailable storage", () => {
    expect(readWorkspace(memoryStorage({ "dm.workspace": "kitchen" }))).toBe(
      "gameMode",
    );
    expect(readWorkspace(undefined)).toBe("gameMode");
    const failing = memoryStorage();
    failing.getItem = () => {
      throw new Error("denied");
    };
    failing.setItem = () => {
      throw new Error("denied");
    };
    expect(readWorkspace(failing)).toBe("gameMode");
    expect(() => {
      saveWorkspace(failing, "assetStudio");
    }).not.toThrow();
  });
});
