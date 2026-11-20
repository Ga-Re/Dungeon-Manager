import { describe, expect, it } from "vitest";
import { memoryStorage } from "./memory-storage.test-data.js";
import { endSession, startSession } from "./crash-marker.js";

// Whether the last session of the DM window ended cleanly (T-114a).

describe("crash marker", () => {
  it("says the first start and a start after a clean end were no crash", () => {
    const storage = memoryStorage();
    expect(startSession(storage)).toBe(false);
    endSession(storage);
    expect(startSession(storage)).toBe(false);
  });

  it("says a start after a session that never ended followed a crash", () => {
    const storage = memoryStorage();
    startSession(storage);
    expect(startSession(storage)).toBe(true);
  });

  it("works without storage, and with a storage that refuses writes", () => {
    expect(startSession(undefined)).toBe(false);
    const storage = memoryStorage();
    storage.setItem = () => {
      throw new Error("full");
    };
    expect(startSession(storage)).toBe(false);
    expect(() => {
      endSession(storage);
    }).not.toThrow();
  });
});
