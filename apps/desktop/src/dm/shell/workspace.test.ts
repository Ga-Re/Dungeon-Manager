import { describe, expect, it } from "vitest";
import { memoryStorage } from "../memory-storage.test-data.js";
import { WORKSPACES, readWorkspace, saveWorkspace } from "./workspace.js";

describe("workspace", () => {
  it("has the five workspaces of ADR-0017, the Game-Orchestrator last", () => {
    expect(WORKSPACES).toEqual([
      "mapForge",
      "assetVault",
      "creatures",
      "campaignAtlas",
      "gameOrchestrator",
    ]);
  });

  it("starts in the Game-Orchestrator and then in the last one used on this device", () => {
    const storage = memoryStorage();
    expect(readWorkspace(storage)).toBe("gameOrchestrator");
    saveWorkspace(storage, "creatures");
    expect(readWorkspace(storage)).toBe("creatures");
  });

  it("opens a workspace remembered under its name before T-171", () => {
    expect(
      readWorkspace(memoryStorage({ "dm.workspace": "assetStudio" })),
    ).toBe("assetVault");
    expect(readWorkspace(memoryStorage({ "dm.workspace": "gameMode" }))).toBe(
      "gameOrchestrator",
    );
  });

  it("falls back to the Game-Orchestrator for unknown values or unavailable storage", () => {
    expect(readWorkspace(memoryStorage({ "dm.workspace": "kitchen" }))).toBe(
      "gameOrchestrator",
    );
    expect(readWorkspace(memoryStorage({ "dm.workspace": "toString" }))).toBe(
      "gameOrchestrator",
    );
    expect(readWorkspace(undefined)).toBe("gameOrchestrator");
    const failing = memoryStorage();
    failing.getItem = () => {
      throw new Error("denied");
    };
    failing.setItem = () => {
      throw new Error("denied");
    };
    expect(readWorkspace(failing)).toBe("gameOrchestrator");
    expect(() => {
      saveWorkspace(failing, "assetVault");
    }).not.toThrow();
  });
});
