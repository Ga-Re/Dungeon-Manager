import { describe, expect, test } from "vitest";
import { gridFromBox, shiftGrid } from "./index.js";

// Grid calibration in the Map Forge (T-177, DM decisions 2026-11-22): the DM drags a square
// box over N × N cells of the map's printed grid (3 by default); cell size and offset follow.

describe("gridFromBox", () => {
  test("a box over 3 × 3 cells gives the cell size and the offset of its corner", () => {
    expect(gridFromBox([130, 250], [430, 550], 3)).toEqual({
      cellSizePx: 100,
      offsetXPx: 30,
      offsetYPx: 50,
    });
  });

  test("the box may be dragged in any direction (also on a turned view)", () => {
    // Dragged from bottom right to top left, as on a view turned by 180°.
    expect(gridFromBox([430, 550], [130, 250], 3)).toEqual(
      gridFromBox([130, 250], [430, 550], 3),
    );
    // Turned by 90°: the corners come mirrored on one axis.
    expect(gridFromBox([130, 550], [430, 250], 3)).toEqual(
      gridFromBox([130, 250], [430, 550], 3),
    );
  });

  test("a box slightly off square takes the mean edge, and any cell count", () => {
    expect(gridFromBox([0, 0], [210, 190], 2)).toEqual({
      cellSizePx: 100,
      offsetXPx: 0,
      offsetYPx: 0,
    });
    expect(gridFromBox([12, 7], [12 + 700, 7 + 700], 10)).toEqual({
      cellSizePx: 70,
      offsetXPx: 12,
      offsetYPx: 7,
    });
  });

  test("the offset is the box corner within one cell, also left of or above the map", () => {
    expect(gridFromBox([-40, 260], [260, 560], 3)).toMatchObject({
      offsetXPx: 60,
      offsetYPx: 60,
    });
  });

  test("an empty box or a cell count outside 1–10 gives no grid", () => {
    expect(gridFromBox([10, 10], [10, 10], 3)).toBeNull();
    expect(gridFromBox([0, 0], [1, 1], 3)).toBeNull();
    expect(gridFromBox([0, 0], [300, 300], 0)).toBeNull();
    expect(gridFromBox([0, 0], [300, 300], 11)).toBeNull();
    expect(gridFromBox([0, 0], [300, 300], 2.5)).toBeNull();
  });
});

describe("shiftGrid", () => {
  test("moves the offset and keeps it within one cell", () => {
    const grid = { cellSizePx: 100, offsetXPx: 30, offsetYPx: 50 };
    expect(shiftGrid(grid, 10, -5)).toEqual({
      cellSizePx: 100,
      offsetXPx: 40,
      offsetYPx: 45,
    });
    expect(shiftGrid(grid, 80, -60)).toEqual({
      cellSizePx: 100,
      offsetXPx: 10,
      offsetYPx: 90,
    });
  });

  test("keeps other grid fields", () => {
    expect(
      shiftGrid(
        { cellSizePx: 50, offsetXPx: 0, offsetYPx: 0, unit: "ft" },
        1,
        1,
      ),
    ).toMatchObject({ unit: "ft", offsetXPx: 1 });
  });
});
