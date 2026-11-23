import fc from "fast-check";
import { describe, expect, test } from "vitest";
import { isInside } from "./fog.js";
import {
  addToArea,
  areasOnLevel,
  labelPoint,
  newAreaId,
  ringArea,
  snapArea,
} from "./index.js";

// Areas of a map (T-108c1, T-262, DM decisions 2026-11-22/23): drawn per level, corners snap to the grid.

const square = (x: number, y: number, size: number) => ({
  outer: [
    [x, y],
    [x + size, y],
    [x + size, y + size],
    [x, y + size],
  ] as [number, number][],
  holes: [],
});
const levels = [{ id: "ground" }, { id: "cellar" }];

describe("areasOnLevel", () => {
  test("a area without a level belongs to the map's first level", () => {
    const areas = [
      { id: "hall", name: "Halle", area: square(0, 0, 10) },
      {
        id: "vault",
        name: "Gewölbe",
        area: square(0, 0, 10),
        levelId: "cellar",
      },
      { id: "lost", name: "Weg", area: square(0, 0, 10), levelId: "gone" },
    ];
    expect(areasOnLevel(areas, levels, "ground").map((r) => r.id)).toEqual([
      "hall",
    ]);
    expect(areasOnLevel(areas, levels, "cellar").map((r) => r.id)).toEqual([
      "vault",
    ]);
  });
});

describe("newAreaId", () => {
  // A deleted area's id is never given out again: scenes keep overrides keyed by it, which
  // must not turn onto a new, unrelated area (ADR-0012).
  test("draws a fresh id from the random source, never one taken", () => {
    const draws = [0.1, 0.1, 0.5];
    const random = () => draws.shift() ?? 0.9;
    const first = newAreaId([], () => 0.1);
    expect(first).toMatch(/^area-[0-9a-z]{6}$/);
    // The first draw is taken: the next one is used.
    const second = newAreaId(["ground", first], random);
    expect(second).not.toBe(first);
    expect(second).toMatch(/^area-[0-9a-z]{6}$/);
  });

  test("after a area is deleted, a new area does not get its id", () => {
    let seed = 0;
    const random = () => {
      seed = (seed * 9301 + 49297) % 233280;
      return seed / 233280;
    };
    const used = new Set<string>();
    for (let i = 0; i < 50; i += 1) used.add(newAreaId([], random));
    // Fifty areas drawn and deleted one after another: no id twice.
    expect(used.size).toBe(50);
  });
});

describe("snapArea", () => {
  const grid = { cellSizePx: 100, offsetXPx: 10, offsetYPx: 20 };

  test("moves a rectangle's or polygon's corners to the nearest grid points", () => {
    const snapped = snapArea(
      {
        outer: [
          [40, 60],
          [230, 50],
          [220, 330],
        ],
        holes: [],
      },
      grid,
      "polygon",
    );
    expect(snapped?.outer).toEqual([
      [10, 20],
      [210, 20],
      [210, 320],
    ]);
  });

  test("fits an ellipse into its bounding box snapped to the grid", () => {
    const ellipse = {
      outer: [
        [40, 120],
        [110, 60],
        [180, 120],
        [110, 190],
      ] as [number, number][],
      holes: [],
    };
    const snapped = snapArea(ellipse, grid, "ellipse");
    const xs = snapped?.outer.map(([x]) => x) ?? [];
    const ys = snapped?.outer.map(([, y]) => y) ?? [];
    expect([Math.min(...xs), Math.max(...xs)]).toEqual([10, 210]);
    expect([Math.min(...ys), Math.max(...ys)]).toEqual([20, 220]);
  });

  test("leaves a lasso as drawn, and gives nothing for an area that snaps flat", () => {
    const lasso = square(33, 44, 50);
    expect(snapArea(lasso, grid, "lasso")).toEqual(lasso);
    expect(snapArea(square(20, 30, 20), grid, "rectangle")).toBeNull();
  });
});

// T-260 (DM decisions 2026-11-23): shapes drawn for one area add up. A shape that overlaps or
// shares an edge with the area so far joins it; one apart from it starts the area anew.
describe("addToArea", () => {
  const size = (polygon: {
    outer: readonly (readonly [number, number])[];
    holes: readonly (readonly (readonly [number, number])[])[];
  }) =>
    ringArea(polygon.outer) -
    polygon.holes.reduce((sum, hole) => sum + ringArea(hole), 0);

  test("the first shape is the area", () => {
    expect(addToArea(null, square(0, 0, 100))).toEqual(square(0, 0, 100));
  });

  test("an overlapping shape joins the area", () => {
    const joined = addToArea(square(0, 0, 100), square(50, 50, 100));
    expect(size(joined)).toBeCloseTo(100 * 100 * 2 - 50 * 50);
  });

  test("a shape sharing an edge joins the area", () => {
    const joined = addToArea(square(0, 0, 100), square(100, 0, 100));
    expect(size(joined)).toBeCloseTo(2 * 100 * 100);
    expect(joined.holes).toEqual([]);
  });

  test("a shape meeting the area at one corner only replaces it", () => {
    expect(addToArea(square(0, 0, 100), square(100, 100, 100))).toEqual(
      square(100, 100, 100),
    );
  });

  test("a shape apart from the area replaces it", () => {
    expect(addToArea(square(0, 0, 100), square(300, 0, 100))).toEqual(
      square(300, 0, 100),
    );
  });

  test("bars closing a frame leave its middle out, as a hole", () => {
    const bar = (x: number, y: number, w: number, h: number) => ({
      outer: [
        [x, y],
        [x + w, y],
        [x + w, y + h],
        [x, y + h],
      ] as [number, number][],
      holes: [],
    });
    let area = addToArea(null, bar(0, 0, 300, 100));
    area = addToArea(area, bar(0, 0, 100, 300));
    area = addToArea(area, bar(200, 0, 100, 300));
    expect(area.holes).toEqual([]);
    area = addToArea(area, bar(0, 200, 300, 100));
    expect(area.holes).toHaveLength(1);
    expect(size(area)).toBeCloseTo(300 * 300 - 100 * 100);
  });

  test("the result is always one area that holds the shape just drawn", () => {
    const rect = fc
      .tuple(
        fc.integer({ min: 0, max: 400 }),
        fc.integer({ min: 0, max: 400 }),
        fc.integer({ min: 10, max: 200 }),
      )
      .map(([x, y, side]) => square(x, y, side));
    fc.assert(
      fc.property(fc.array(rect, { minLength: 1, maxLength: 6 }), (shapes) => {
        let area: ReturnType<typeof addToArea> | null = null;
        for (const shape of shapes) {
          area = addToArea(area, shape);
          // One polygon, never smaller than the shape it must contain.
          expect(area.outer.length).toBeGreaterThanOrEqual(3);
          expect(size(area)).toBeGreaterThanOrEqual(size(shape) - 1e-6);
        }
      }),
    );
  });
});

// Where an area's name stands on the map (T-260): inside the area, never in one of its holes.
describe("labelPoint", () => {
  test("the middle of a simple area", () => {
    expect(labelPoint(square(0, 0, 100))).toEqual([50, 50]);
  });

  test("inside a frame, not in its hole", () => {
    const frame = {
      outer: [
        [0, 0],
        [300, 0],
        [300, 300],
        [0, 300],
      ] as [number, number][],
      holes: [
        [
          [100, 100],
          [200, 100],
          [200, 200],
          [100, 200],
        ] as [number, number][],
      ],
    };
    const point = labelPoint(frame);
    expect(isInside([frame], point)).toBe(true);
  });

  test("inside an L whose middle lies outside", () => {
    const l = {
      outer: [
        [0, 0],
        [300, 0],
        [300, 20],
        [20, 20],
        [20, 300],
        [0, 300],
      ] as [number, number][],
      holes: [],
    };
    const point = labelPoint(l);
    expect(isInside([l], point)).toBe(true);
  });
});
