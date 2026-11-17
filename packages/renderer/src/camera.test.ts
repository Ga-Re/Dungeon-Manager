import { describe, expect, test } from "vitest";
import {
  fitCamera,
  panBy,
  rotateBy,
  screenToMap,
  zoomAt,
  type Camera,
  type Size,
} from "./camera.js";

const map: Size = { width: 2000, height: 1000 };
const view: Size = { width: 1000, height: 1000 };

const close = (actual: { x: number; y: number }, x: number, y: number) => {
  expect(actual.x).toBeCloseTo(x, 6);
  expect(actual.y).toBeCloseTo(y, 6);
};

describe("fitCamera", () => {
  test("shows the whole map, centred", () => {
    expect(fitCamera(map, view, 0)).toEqual({
      centerX: 1000,
      centerY: 500,
      zoom: 0.5,
      rotation: 0,
    });
  });

  test("swaps width and height when rotated by 90°", () => {
    expect(fitCamera(map, { width: 1000, height: 2000 }, 90).zoom).toBe(1);
    expect(fitCamera(map, { width: 1000, height: 2000 }, 0).zoom).toBe(0.5);
  });

  test("an empty view or map never yields zero or infinite zoom", () => {
    expect(fitCamera(map, { width: 0, height: 0 }, 0).zoom).toBeGreaterThan(0);
    expect(fitCamera({ width: 0, height: 0 }, view, 0).zoom).toBe(1);
  });
});

describe("screenToMap", () => {
  test("the view centre is the camera centre, in every rotation", () => {
    for (const rotation of [0, 90, 180, 270] as const) {
      close(
        screenToMap({ centerX: 300, centerY: 200, zoom: 2, rotation }, view, {
          x: 500,
          y: 500,
        }),
        300,
        200,
      );
    }
  });

  test("accounts for zoom and rotation", () => {
    const camera: Camera = { centerX: 0, centerY: 0, zoom: 2, rotation: 0 };
    close(screenToMap(camera, view, { x: 700, y: 500 }), 100, 0);
    // Rotated by 90° clockwise, a point right of the centre lies above it on the map.
    close(
      screenToMap({ ...camera, rotation: 90 }, view, { x: 700, y: 500 }),
      0,
      -100,
    );
    close(
      screenToMap({ ...camera, rotation: 180 }, view, { x: 700, y: 500 }),
      -100,
      0,
    );
  });
});

describe("zoomAt", () => {
  test("keeps the map point under the cursor in place", () => {
    for (const rotation of [0, 90, 180, 270] as const) {
      const camera: Camera = { centerX: 400, centerY: 300, zoom: 1, rotation };
      const cursor = { x: 820, y: 130 };
      const before = screenToMap(camera, view, cursor);
      const after = screenToMap(
        zoomAt(camera, 2.5, cursor, view),
        view,
        cursor,
      );
      close(after, before.x, before.y);
    }
  });

  test("stays within the zoom limits", () => {
    const camera: Camera = { centerX: 0, centerY: 0, zoom: 1, rotation: 0 };
    expect(zoomAt(camera, 1e9, { x: 0, y: 0 }, view).zoom).toBe(16);
    expect(zoomAt(camera, 1e-9, { x: 0, y: 0 }, view).zoom).toBe(1 / 64);
  });
});

describe("panBy", () => {
  test("moves the map with the pointer, also when rotated", () => {
    const camera: Camera = { centerX: 0, centerY: 0, zoom: 2, rotation: 0 };
    const start = { x: 600, y: 400 };
    for (const rotation of [0, 90, 180, 270] as const) {
      const rotated = { ...camera, rotation };
      const grabbed = screenToMap(rotated, view, start);
      const moved = panBy(rotated, { x: 37, y: -12 });
      close(screenToMap(moved, view, { x: 637, y: 388 }), grabbed.x, grabbed.y);
    }
  });
});

describe("rotateBy", () => {
  test("turns in quarter steps and wraps around", () => {
    const camera: Camera = { centerX: 1, centerY: 2, zoom: 3, rotation: 270 };
    expect(rotateBy(camera, 90)).toEqual({ ...camera, rotation: 0 });
    expect(rotateBy(camera, -90).rotation).toBe(180);
  });
});
