import { describe, expect, test } from "vitest";
import { screenToMap, type Camera } from "./camera.js";
import { createVideoGate, cssTransform } from "./video-layer.js";

const view = { width: 800, height: 400 };

/** Applies a CSS `matrix(a, b, c, d, e, f)` to a point, as the browser does. */
function applyMatrix(css: string, x: number, y: number) {
  const values =
    /matrix\(([^)]+)\)/.exec(css)?.[1]?.split(",").map(Number) ?? [];
  const [a = 0, b = 0, c = 0, d = 0, e = 0, f = 0] = values;
  return { x: a * x + c * y + e, y: b * x + d * y + f };
}

describe("cssTransform", () => {
  test("puts every map point where the canvas draws it, in all rotations", () => {
    for (const rotation of [0, 90, 180, 270] as const) {
      const camera: Camera = {
        centerX: 300,
        centerY: 200,
        zoom: 1.5,
        rotation,
      };
      const css = cssTransform(camera, view);
      for (const screen of [
        { x: 0, y: 0 },
        { x: 800, y: 400 },
        { x: 123, y: 321 },
      ]) {
        const map = screenToMap(camera, view, screen);
        const placed = applyMatrix(css, map.x, map.y);
        expect(placed.x).toBeCloseTo(screen.x, 6);
        expect(placed.y).toBeCloseTo(screen.y, 6);
      }
    }
  });
});

describe("video gate (fail closed, ADR-0010)", () => {
  test("hidden until a frame was drawn with the fog known", () => {
    const gate = createVideoGate();
    expect(gate.visible()).toBe(false);
    gate.drawn();
    expect(gate.visible()).toBe(false);
    gate.fogSet();
    expect(gate.visible()).toBe(false);
    gate.drawn();
    expect(gate.visible()).toBe(true);
  });

  test("hidden again on resize, a new video and context loss until the next draw", () => {
    const gate = createVideoGate();
    gate.fogSet();
    gate.drawn();
    gate.resized();
    expect(gate.visible()).toBe(false);
    gate.drawn();
    expect(gate.visible()).toBe(true);
    gate.newVideo();
    expect(gate.visible()).toBe(false);
    gate.drawn();
    gate.contextLost();
    gate.drawn();
    expect(gate.visible()).toBe(false);
    gate.contextRestored();
    expect(gate.visible()).toBe(false);
    gate.drawn();
    expect(gate.visible()).toBe(true);
    gate.destroyed();
    gate.drawn();
    expect(gate.visible()).toBe(false);
  });

  test("a failed draw hides the video until a draw succeeds", () => {
    const gate = createVideoGate();
    gate.fogSet();
    gate.drawn();
    gate.renderFailed();
    expect(gate.visible()).toBe(false);
    gate.drawn();
    expect(gate.visible()).toBe(true);
  });
});
