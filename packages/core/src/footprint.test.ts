import { describe, expect, test } from "vitest";
import {
  canOccupy,
  clampGroupShift,
  gridBounds,
  gridFootprint,
  middleCell,
  nearestFreeCell,
  occupiedCells,
} from "./footprint.js";

// The grid footprint of tokens (T-180a) and T-233's rule: one token per cell, up to four Tiny
// ones share a cell, a larger token claims every cell of its footprint.

describe("grid footprint", () => {
  test("follows the 5e size, Tiny taking a quarter of a cell", () => {
    expect(gridFootprint("tiny")).toEqual({ cols: 1, rows: 1, share: 0.25 });
    expect(gridFootprint("small")).toEqual({ cols: 1, rows: 1, share: 1 });
    expect(gridFootprint("medium")).toEqual({ cols: 1, rows: 1, share: 1 });
    expect(gridFootprint("large")).toEqual({ cols: 2, rows: 2, share: 1 });
    expect(gridFootprint("huge")).toEqual({ cols: 3, rows: 3, share: 1 });
    expect(gridFootprint("gargantuan")).toEqual({ cols: 4, rows: 4, share: 1 });
  });

  test("a creature's own footprint wins, in whole cells", () => {
    expect(gridFootprint("large", { cols: 2, rows: 4 })).toEqual({
      cols: 2,
      rows: 4,
      share: 1,
    });
    // A Tiny creature with a footprint of its own claims its cells like any other.
    expect(gridFootprint("tiny", { cols: 1, rows: 2 }).share).toBe(1);
  });

  test("covers the cells from the token's position (its top left cell)", () => {
    expect(occupiedCells({ col: 3, row: 1 }, gridFootprint("large"))).toEqual([
      { col: 3, row: 1 },
      { col: 4, row: 1 },
      { col: 3, row: 2 },
      { col: 4, row: 2 },
    ]);
  });
});

describe("free cells (T-233)", () => {
  const medium = gridFootprint("medium");
  const tiny = gridFootprint("tiny");
  const at = (col: number, row: number) => ({ col, row });

  test("one token per cell", () => {
    expect(canOccupy([], at(0, 0), medium)).toBe(true);
    expect(
      canOccupy([{ position: at(0, 0), footprint: medium }], at(0, 0), medium),
    ).toBe(false);
    expect(
      canOccupy([{ position: at(0, 0), footprint: medium }], at(1, 0), medium),
    ).toBe(true);
  });

  test("up to four Tiny ones share a cell, but not with a larger one", () => {
    const tinies = (count: number) =>
      Array.from({ length: count }, () => ({
        position: at(0, 0),
        footprint: tiny,
      }));
    expect(canOccupy(tinies(3), at(0, 0), tiny)).toBe(true);
    expect(canOccupy(tinies(4), at(0, 0), tiny)).toBe(false);
    expect(canOccupy(tinies(1), at(0, 0), medium)).toBe(false);
    expect(
      canOccupy([{ position: at(0, 0), footprint: medium }], at(0, 0), tiny),
    ).toBe(false);
  });

  test("a larger token claims every cell of its footprint", () => {
    const large = gridFootprint("large");
    const others = [{ position: at(1, 1), footprint: medium }];
    expect(canOccupy(others, at(0, 0), large)).toBe(false);
    expect(canOccupy(others, at(2, 0), large)).toBe(true);
  });
});

describe("nearest free cell (T-107a; also for T-233's snap)", () => {
  const medium = gridFootprint("medium");
  const at = (col: number, row: number) => ({ col, row });
  const bounds = { cols: 10, rows: 10 };

  test("is the wanted cell when it is free", () => {
    expect(nearestFreeCell(at(4, 4), medium, [], bounds)).toEqual(at(4, 4));
  });

  test("is the closest free one around a taken cell, nearest first", () => {
    const taken = [{ position: at(4, 4), footprint: medium }];
    const found = nearestFreeCell(at(4, 4), medium, taken, bounds);
    expect(found).not.toEqual(at(4, 4));
    expect(
      Math.max(
        Math.abs((found?.col ?? 0) - 4),
        Math.abs((found?.row ?? 0) - 4),
      ),
    ).toBe(1);
  });

  test("keeps a large footprint inside the map", () => {
    const found = nearestFreeCell(at(9, 9), gridFootprint("large"), [], bounds);
    expect(found).toEqual(at(8, 8));
  });

  test("is none when nothing is free", () => {
    const full = Array.from({ length: 4 }, (_, index) => ({
      position: at(index % 2, Math.floor(index / 2)),
      footprint: medium,
    }));
    expect(
      nearestFreeCell(at(0, 0), medium, full, { cols: 2, rows: 2 }),
    ).toBeNull();
  });
});

describe("nearest free cell for Tiny tokens (T-107a review)", () => {
  const tiny = gridFootprint("tiny");
  const at = (col: number, row: number) => ({ col, row });

  test("four share a cell, a fifth goes next to it", () => {
    const four = Array.from({ length: 4 }, () => ({
      position: at(2, 2),
      footprint: tiny,
    }));
    expect(
      nearestFreeCell(at(2, 2), tiny, four.slice(0, 3), { cols: 5, rows: 5 }),
    ).toEqual(at(2, 2));
    const fifth = nearestFreeCell(at(2, 2), tiny, four, { cols: 5, rows: 5 });
    expect(fifth).not.toEqual(at(2, 2));
  });

  test("a wanted cell outside the map is moved inside", () => {
    expect(
      nearestFreeCell(at(-3, 12), gridFootprint("medium"), [], {
        cols: 5,
        rows: 5,
      }),
    ).toEqual(at(0, 4));
  });

  test("a full big map answers quickly", () => {
    const medium = gridFootprint("medium");
    const full = [];
    for (let row = 0; row < 120; row++)
      for (let col = 0; col < 120; col++)
        full.push({ position: at(col, row), footprint: medium });
    const started = Date.now();
    expect(
      nearestFreeCell(at(60, 60), medium, full, { cols: 120, rows: 120 }),
    ).toBeNull();
    expect(Date.now() - started).toBeLessThan(2000);
  });
});

describe("whole cells of a map (T-107a review)", () => {
  test("count from the grid's offset, without cells cut by the map's edge", () => {
    const grid = (offsetXPx: number, offsetYPx: number) => ({
      cellSizePx: 100,
      offsetXPx,
      offsetYPx,
    });
    expect(gridBounds({ width: 1000, height: 500 }, grid(0, 0))).toEqual({
      firstCol: 0,
      firstRow: 0,
      cols: 10,
      rows: 5,
    });
    // Not a multiple of the cell: the last partial cell is left out.
    expect(gridBounds({ width: 1050, height: 550 }, grid(0, 0))).toMatchObject({
      cols: 10,
      rows: 5,
    });
    // A negative offset cuts cell 0: it is left out.
    expect(
      gridBounds({ width: 1000, height: 500 }, grid(-30, 0)),
    ).toMatchObject({
      firstCol: 1,
      cols: 10,
    });
    // An offset beyond a cell: the cells before it would be negative, which no file allows.
    expect(
      gridBounds({ width: 1000, height: 500 }, grid(150, 0)),
    ).toMatchObject({
      firstCol: 0,
      cols: 8,
    });
    expect(
      gridBounds(
        { width: 50, height: 50 },
        { cellSizePx: 100, offsetXPx: 0, offsetYPx: 0 },
      ),
    ).toMatchObject({ cols: 0, rows: 0 });
  });

  test("the middle cell, and the nearest free cell stays inside the whole cells", () => {
    const bounds = gridBounds(
      { width: 1000, height: 500 },
      { cellSizePx: 100, offsetXPx: -30, offsetYPx: 0 },
    );
    const medium = gridFootprint("medium");
    expect(middleCell(bounds, medium)).toEqual({ col: 5, row: 2 });
    expect(nearestFreeCell({ col: 0, row: 0 }, medium, [], bounds)).toEqual({
      col: 1,
      row: 0,
    });
  });
});

describe("clampGroupShift (T-107b)", () => {
  const bounds = { firstCol: 0, firstRow: 0, cols: 10, rows: 8 };
  const one = { cols: 1, rows: 1, share: 1 };
  const large = { cols: 2, rows: 2, share: 1 };
  const group = [
    { position: { col: 2, row: 2 }, footprint: one },
    { position: { col: 4, row: 3 }, footprint: large },
  ];

  test("keeps a shift that stays on the map", () => {
    expect(clampGroupShift(group, { col: 3, row: -2 }, bounds)).toEqual({
      col: 3,
      row: -2,
    });
  });

  test("stops the whole group at the map's edges, keeping its formation", () => {
    // The large token's right column may reach col 9: 4 + 2 + 4 - 1.
    expect(clampGroupShift(group, { col: 20, row: 20 }, bounds)).toEqual({
      col: 4,
      row: 3,
    });
    expect(clampGroupShift(group, { col: -20, row: -20 }, bounds)).toEqual({
      col: -2,
      row: -2,
    });
  });

  test("never moves a token already off the map further out", () => {
    const outside = [{ position: { col: 12, row: 0 }, footprint: one }];
    expect(clampGroupShift(outside, { col: 1, row: 0 }, bounds)).toEqual({
      col: 0,
      row: 0,
    });
    expect(clampGroupShift(outside, { col: -3, row: 0 }, bounds)).toEqual({
      col: -3,
      row: 0,
    });
  });
});
