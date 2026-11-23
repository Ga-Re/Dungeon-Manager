import { describe, expect, test } from "vitest";
import { newAreaId, areasOnLevel, snapArea } from "./index.js";

// Rooms of a map (T-108c1, DM decisions 2026-11-22): drawn per level, corners snap to the grid.

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
  test("a room without a level belongs to the map's first level", () => {
    const rooms = [
      { id: "hall", name: "Halle", area: square(0, 0, 10) },
      {
        id: "vault",
        name: "Gewölbe",
        area: square(0, 0, 10),
        levelId: "cellar",
      },
      { id: "lost", name: "Weg", area: square(0, 0, 10), levelId: "gone" },
    ];
    expect(areasOnLevel(rooms, levels, "ground").map((r) => r.id)).toEqual([
      "hall",
    ]);
    expect(areasOnLevel(rooms, levels, "cellar").map((r) => r.id)).toEqual([
      "vault",
    ]);
  });
});

describe("newAreaId", () => {
  // A deleted room's id is never given out again: scenes keep overrides keyed by it, which
  // must not turn onto a new, unrelated room (ADR-0012).
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

  test("after a room is deleted, a new room does not get its id", () => {
    let seed = 0;
    const random = () => {
      seed = (seed * 9301 + 49297) % 233280;
      return seed / 233280;
    };
    const used = new Set<string>();
    for (let i = 0; i < 50; i += 1) used.add(newAreaId([], random));
    // Fifty rooms drawn and deleted one after another: no id twice.
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
