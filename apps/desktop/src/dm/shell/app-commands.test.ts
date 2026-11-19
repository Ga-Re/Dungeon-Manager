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

  it("closes open dialogs before a command runs", () => {
    const commands = createAppCommands();
    const order: string[] = [];
    const remove = commands.registerModal(() => order.push("close welcome"));
    commands.register("settings", () => order.push("open settings"));
    commands.run("settings");
    expect(order).toEqual(["close welcome", "open settings"]);
    remove();
    commands.run("settings");
    expect(order.at(-1)).toBe("open settings");
    expect(order).toHaveLength(3);
  });
});
