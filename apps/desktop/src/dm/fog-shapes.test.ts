import type { Camera } from "@dungeon-manager/renderer";
import { describe, expect, test } from "vitest";
import {
  brushArea,
  dragArea,
  lassoArea,
  polygonArea,
  squareEnd,
} from "./fog-shapes.js";

const view = { width: 800, height: 400 };
// Map point (800, 400) in the view centre, 2 screen pixels per map pixel.
const camera: Camera = { centerX: 800, centerY: 400, zoom: 2, rotation: 0 };

describe("dragArea", () => {
  test("an ellipse is drawn from its middle, in map pixels (T-247)", () => {
    const ellipse = dragArea(
      "ellipse",
      { x: 400, y: 200 },
      { x: 600, y: 280 },
      camera,
      view,
    );
    // Around map (800, 400) where the drag started: radii 100 and 40.
    for (const [x, y] of ellipse?.outer ?? [])
      expect(((x - 800) / 100) ** 2 + ((y - 400) / 40) ** 2).toBeCloseTo(1, 6);
    expect(ellipse?.outer.length).toBeGreaterThan(16);
  });

  test("with Shift the ellipse is a circle on the drag's longer side", () => {
    const end = squareEnd({ x: 400, y: 200 }, { x: 600, y: 160 });
    expect(end).toEqual({ x: 600, y: 0 });
    const circle = dragArea("ellipse", { x: 400, y: 200 }, end, camera, view);
    for (const [x, y] of circle?.outer ?? [])
      expect(Math.hypot(x - 800, y - 400)).toBeCloseTo(100, 6);
  });

  test("an ellipse in a turned view keeps its middle and turns its radii", () => {
    const turned: Camera = { ...camera, rotation: 90 };
    const ellipse = dragArea(
      "ellipse",
      { x: 400, y: 200 },
      { x: 600, y: 280 },
      turned,
      view,
    );
    // A quarter turn swaps the radii on the map: 40 and 100.
    const xs = (ellipse?.outer ?? []).map(([x]) => x);
    const ys = (ellipse?.outer ?? []).map(([, y]) => y);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(80, 6);
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(200, 6);
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
      dragArea("ellipse", { x: 0, y: 0 }, { x: 2, y: 50 }, camera, view),
    ).toBeNull();
  });
});

describe("rounded rectangles (T-170)", () => {
  test("a rectangle with rounded corners spans the drag in map pixels", () => {
    const area = dragArea(
      "rectangle",
      { x: 400, y: 200 },
      { x: 500, y: 300 },
      camera,
      view,
      10,
    );
    // Screen (400,200)–(500,300) is map (800,400)–(850,450).
    expect(area?.outer.length).toBeGreaterThan(4);
    for (const [x, y] of area?.outer ?? []) {
      expect(x).toBeGreaterThanOrEqual(800 - 1e-9);
      expect(x).toBeLessThanOrEqual(850 + 1e-9);
      expect(y).toBeGreaterThanOrEqual(400 - 1e-9);
      expect(y).toBeLessThanOrEqual(450 + 1e-9);
    }
    expect(area?.outer).not.toContainEqual([800, 400]);
  });

  test("the same rectangle when the view is turned", () => {
    const turned: Camera = { ...camera, rotation: 90 };
    // 200 wide and 100 tall on screen: turned a quarter, 50 wide and 100 tall on the map.
    const area = dragArea(
      "rectangle",
      { x: 300, y: 150 },
      { x: 500, y: 250 },
      turned,
      view,
      10,
    );
    const xs = area?.outer.map(([x]) => x) ?? [];
    const ys = area?.outer.map(([, y]) => y) ?? [];
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(50, 6);
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(100, 6);
    expect(area?.outer.length).toBeGreaterThan(4);
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

describe("lassoArea (T-247)", () => {
  test("a freehand loop becomes a closed polygon in map pixels", () => {
    const area = lassoArea(
      [
        { x: 400, y: 200 },
        { x: 500, y: 200 },
        { x: 500, y: 300 },
        { x: 400, y: 300 },
      ],
      camera,
      view,
    );
    expect(area).toEqual({
      outer: [
        [800, 400],
        [850, 400],
        [850, 450],
        [800, 450],
      ],
      holes: [],
    });
  });

  test("drops points on the same spot, and a stroke that encloses nothing", () => {
    const area = lassoArea(
      [
        { x: 400, y: 200 },
        { x: 401, y: 200 },
        { x: 500, y: 200 },
        { x: 500, y: 300 },
      ],
      camera,
      view,
    );
    expect(area?.outer).toHaveLength(3);
    expect(
      lassoArea(
        [
          { x: 400, y: 200 },
          { x: 500, y: 200 },
          { x: 600, y: 200 },
        ],
        camera,
        view,
      ),
    ).toBeNull();
  });
});
