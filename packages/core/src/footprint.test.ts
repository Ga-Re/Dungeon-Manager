import { describe, expect, test } from "vitest";
import {
  canOccupy,
  gridFootprint,
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
