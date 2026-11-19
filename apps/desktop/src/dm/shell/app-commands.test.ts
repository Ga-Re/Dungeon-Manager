import { describe, expect, it, vi } from "vitest";
import { createAppCommands } from "./app-commands.js";

describe("app commands", () => {
  it("runs the registered handler, the latest one, until it is removed", () => {
    const commands = createAppCommands();
    const first = vi.fn();
    const second = vi.fn();
    const removeFirst = commands.register("welcome", first);
    const removeSecond = commands.register("welcome", second);
    commands.run("welcome");
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledOnce();
    // Removing an older handler leaves the newer one.
    removeFirst();
    commands.run("welcome");
    expect(second).toHaveBeenCalledTimes(2);
    removeSecond();
    commands.run("welcome");
    expect(second).toHaveBeenCalledTimes(2);
    expect(() => {
      commands.run("newCampaign");
    }).not.toThrow();
  });
});
