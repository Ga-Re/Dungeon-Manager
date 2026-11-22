import { describe, expect, test, vi } from "vitest";
import { createCommandRegistry } from "./command.js";

// One ribbon command at a time (ADR-0020).
describe("createCommandRegistry", () => {
  test("starting a command cancels the one running; a released one is not cancelled", () => {
    const registry = createCommandRegistry();
    const calibrate = vi.fn();
    const drawRoom = vi.fn();
    registry.claim(calibrate);
    const release = registry.claim(drawRoom);
    expect(calibrate).toHaveBeenCalledTimes(1);
    expect(drawRoom).not.toHaveBeenCalled();
    release();
    registry.claim(vi.fn());
    expect(drawRoom).not.toHaveBeenCalled();
  });

  test("a stale release never frees the command that came after it", () => {
    const registry = createCommandRegistry();
    const first = registry.claim(vi.fn());
    const second = vi.fn();
    registry.claim(second);
    first();
    registry.claim(vi.fn());
    expect(second).toHaveBeenCalledTimes(1);
  });
});
