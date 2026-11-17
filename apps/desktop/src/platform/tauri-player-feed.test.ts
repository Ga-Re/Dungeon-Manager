import { beforeEach, describe, expect, test, vi } from "vitest";
import {
  createTauriPlayerFeedReceiver,
  createTauriPlayerFeedSender,
} from "./tauri-player-feed.js";

const fake = vi.hoisted(() => ({
  handlers: new Map<string, (event: { payload: unknown }) => void>(),
  emitTo: vi.fn(),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: (event: string, handler: (event: { payload: unknown }) => void) => {
    fake.handlers.set(event, handler);
    return Promise.resolve(() => undefined);
  },
  emitTo: fake.emitTo,
}));

const valid = { v: 1, scene: null, rotation: 90 };

describe("player feed over Tauri events", () => {
  beforeEach(() => {
    fake.handlers.clear();
    fake.emitTo.mockReset();
  });

  test("the receiver replays the latest message to new subscribers", async () => {
    const receiver = createTauriPlayerFeedReceiver();
    const deliver = fake.handlers.get("player-view");
    deliver?.({ payload: valid });

    const listener = vi.fn();
    const stop = await receiver.subscribe(listener);
    expect(listener).toHaveBeenCalledExactlyOnceWith(valid);
    stop();
    deliver?.({ payload: valid });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  test("an invalid message blanks the TV instead of keeping the last picture", async () => {
    const receiver = createTauriPlayerFeedReceiver();
    const deliver = fake.handlers.get("player-view");
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const listener = vi.fn();
    await receiver.subscribe(listener);
    const shown = {
      v: 1,
      scene: { id: "s", name: "Höhle", map: null, fog: {}, tokens: [] },
      rotation: 90,
    };
    deliver?.({ payload: shown });
    deliver?.({ payload: { v: 2, scene: { secret: true }, rotation: 0 } });
    expect(listener).toHaveBeenLastCalledWith({
      v: 1,
      scene: null,
      rotation: 90,
    });
  });

  test("the sender targets the player window and resends when it has loaded", () => {
    vi.useFakeTimers();
    const sender = createTauriPlayerFeedSender();
    sender.rotate(90);
    expect(fake.emitTo).toHaveBeenLastCalledWith(
      "player",
      "player-view",
      valid,
    );
    fake.handlers.get("player-ready")?.({ payload: null });
    vi.advanceTimersByTime(1000);
    expect(fake.emitTo).toHaveBeenCalledTimes(3);
    vi.useRealTimers();
  });
});
