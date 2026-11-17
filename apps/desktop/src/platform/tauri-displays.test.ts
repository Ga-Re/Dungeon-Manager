import { PhysicalPosition, PhysicalSize } from "@tauri-apps/api/dpi";
import type { Monitor } from "@tauri-apps/api/window";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { DisplayError } from "./displays.js";
import {
  createTauriDisplayService,
  detectPlatformFamily,
} from "./tauri-displays.js";

// vi.mock factories are hoisted above the imports, so their shared state is hoisted too.
const fake = vi.hoisted(() => {
  /** Every window command in order, so tests can assert the sequence. */
  const calls: string[] = [];
  const state = {
    existingPlayer: null as unknown,
    creationError: null as string | null,
    created: [] as { options: Record<string, unknown> }[],
    monitors: [] as unknown[],
  };
  const record = (call: string) => {
    calls.push(call);
    return Promise.resolve();
  };
  const position = (value: {
    constructor: { name: string };
    x: number;
    y: number;
  }) => `${value.constructor.name}:${String(value.x)},${String(value.y)}`;

  class FakeWindow {
    constructor(readonly options: Record<string, unknown> = {}) {}
    setFullscreen = vi.fn((on: boolean) => record(`fullscreen:${String(on)}`));
    setSimpleFullscreen = vi.fn((on: boolean) =>
      record(`simpleFullscreen:${String(on)}`),
    );
    setPosition = vi.fn(
      (value: { constructor: { name: string }; x: number; y: number }) =>
        record(`position:${position(value)}`),
    );
    show = vi.fn(() => record("show"));
    setFocus = vi.fn(() => record("focus"));
    once = vi.fn(
      (event: string, handler: (event: { payload: string }) => void) => {
        if (event === "tauri://created" && state.creationError === null)
          handler({ payload: "" });
        if (event === "tauri://error" && state.creationError !== null)
          handler({ payload: state.creationError });
        return Promise.resolve(() => undefined);
      },
    );
  }
  return { calls, state, FakeWindow };
});

vi.mock("@tauri-apps/api/webviewWindow", () => ({
  WebviewWindow: class extends fake.FakeWindow {
    static getByLabel = vi.fn(() => Promise.resolve(fake.state.existingPlayer));
    constructor(_label: string, options: Record<string, unknown>) {
      super(options);
      fake.state.created.push(this);
    }
  },
}));

vi.mock("@tauri-apps/api/window", () => ({
  availableMonitors: vi.fn(() => Promise.resolve(fake.state.monitors)),
}));

const { calls, state } = fake;
const monitors = state.monitors as Monitor[];
const created = state.created;

function monitor(
  name: string | null,
  x: number,
  width: number,
  scaleFactor: number,
): Monitor {
  const size = new PhysicalSize(width, 900 * scaleFactor);
  const position = new PhysicalPosition(x, 0);
  return { name, size, position, scaleFactor, workArea: { position, size } };
}

beforeEach(() => {
  calls.length = 0;
  created.length = 0;
  state.existingPlayer = null;
  state.creationError = null;
  // Retina laptop (scale 2) left, TV (scale 1) to the right at logical x = 1512.
  monitors.splice(
    0,
    monitors.length,
    monitor("Built-in", 0, 3024, 2),
    monitor(null, 1512, 3840, 1),
  );
});

describe("createTauriDisplayService", () => {
  test("lists monitors as displays with physical resolution", async () => {
    const displays = await createTauriDisplayService("other").listDisplays();

    expect(displays).toEqual([
      { id: "0", name: "Built-in", width: 3024, height: 1800 },
      { id: "1", name: null, width: 3840, height: 900 },
    ]);
  });

  test("creates a hidden, borderless player window and shows it after moving it fullscreen", async () => {
    const service = createTauriDisplayService("other");
    const [, tv] = await service.listDisplays();
    if (!tv) throw new Error("fixture needs two displays");

    await service.openPlayerView(tv, "Spieleransicht");

    expect(created).toHaveLength(1);
    expect(created[0]?.options).toMatchObject({
      url: "player.html",
      title: "Spieleransicht",
      decorations: false,
      visible: false,
    });
    expect(calls).toEqual([
      "fullscreen:false",
      "position:PhysicalPosition:1512,0",
      "fullscreen:true",
      "show",
      "focus",
    ]);
  });

  test("on macOS uses the logical origin and simple fullscreen (no Space animation)", async () => {
    const service = createTauriDisplayService("macos");
    const [laptop] = await service.listDisplays();
    if (!laptop) throw new Error("fixture needs a display");
    monitors[0] = monitor("Built-in", 3024, 3024, 2);
    await service.listDisplays();

    await service.openPlayerView(laptop, "Spieleransicht");

    expect(calls).toEqual([
      "simpleFullscreen:false",
      "position:LogicalPosition:1512,0",
      "simpleFullscreen:true",
      "show",
      "focus",
    ]);
  });

  test("reuses an already open player window instead of creating a second one", async () => {
    state.existingPlayer = new fake.FakeWindow();
    const service = createTauriDisplayService("other");
    const [laptop] = await service.listDisplays();
    if (!laptop) throw new Error("fixture needs a display");

    await service.openPlayerView(laptop, "Spieleransicht");

    expect(created).toHaveLength(0);
    expect(calls).toContain("position:PhysicalPosition:0,0");
  });

  test("rejects a display that is not in the latest listing", async () => {
    const service = createTauriDisplayService("other");

    await expect(
      service.openPlayerView(
        { id: "7", name: null, width: 1, height: 1 },
        "Spieleransicht",
      ),
    ).rejects.toEqual(new DisplayError("unknownDisplay"));
  });

  test("passes window creation errors on", async () => {
    state.creationError = "a webview with label `player` already exists";
    const service = createTauriDisplayService("other");
    const [laptop] = await service.listDisplays();
    if (!laptop) throw new Error("fixture needs a display");

    await expect(
      service.openPlayerView(laptop, "Spieleransicht"),
    ).rejects.toThrow("already exists");
  });
});

describe("detectPlatformFamily", () => {
  test("recognises WKWebView on macOS", () => {
    expect(
      detectPlatformFamily(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko)",
      ),
    ).toBe("macos");
  });

  test("treats everything else as other", () => {
    expect(
      detectPlatformFamily(
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/605.1.15",
      ),
    ).toBe("other");
  });
});
