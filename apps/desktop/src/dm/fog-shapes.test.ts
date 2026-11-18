import type { Camera } from "@dungeon-manager/renderer";
import { describe, expect, test } from "vitest";
import { brushArea, dragArea, polygonArea } from "./fog-shapes.js";

const view = { width: 800, height: 400 };
// Map point (800, 400) in the view centre, 2 screen pixels per map pixel.
const camera: Camera = { centerX: 800, centerY: 400, zoom: 2, rotation: 0 };

describe("dragArea", () => {
  test("a circle is centred where the drag started, its radius in map pixels", () => {
    const circle = dragArea(
      "circle",
      { x: 400, y: 200 },
      { x: 460, y: 280 },
      camera,
      view,
    );
    // 100 screen pixels = 50 map pixels.
    for (const [x, y] of circle?.outer ?? [])
      expect(Math.hypot(x - 800, y - 400)).toBeCloseTo(50, 6);
    expect(circle?.outer.length).toBeGreaterThan(16);
  });

  test("a rectangle spans the drag; slips mark nothing", () => {
    expect(
      dragArea(
        "rectangle",
        { x: 400, y: 200 },
        { x: 500, y: 300 },
        camera,
        view,
      ),
    ).toEqual({
      outer: [
        [800, 400],
        [850, 400],
        [850, 450],
        [800, 450],
      ],
      holes: [],
    });
    expect(
      dragArea("rectangle", { x: 0, y: 0 }, { x: 2, y: 50 }, camera, view),
    ).toBeNull();
    expect(
      dragArea("circle", { x: 0, y: 0 }, { x: 2, y: 2 }, camera, view),
    ).toBeNull();
  });
});

describe("brushArea and polygonArea", () => {
  test("a brush stroke covers its path in map pixels", () => {
    const stroke = brushArea(
      [
        { x: 400, y: 200 },
        { x: 600, y: 200 },
      ],
      10,
      camera,
      view,
    );
    const xs = stroke?.outer.map(([x]) => x) ?? [];
    expect(Math.min(...xs)).toBeCloseTo(790, 0);
    expect(Math.max(...xs)).toBeCloseTo(910, 0);
  });

  test("a polygon with all corners on one line encloses nothing", () => {
    expect(
      polygonArea([
        [0, 0],
        [10, 0],
        [10, 0],
      ]),
    ).toBeNull();
    expect(
      polygonArea([
        [0, 0],
        [5, 5],
        [10, 10],
      ]),
    ).toBeNull();
  });

  test("a polygon needs three corners", () => {
    expect(
      polygonArea([
        [0, 0],
        [1, 0],
      ]),
    ).toBeNull();
    expect(
      polygonArea([
        [0, 0],
        [10, 0],
        [0, 10],
      ]),
    ).toEqual({
      outer: [
        [0, 0],
        [10, 0],
        [0, 10],
      ],
      holes: [],
    });
  });
});
