import { describe, expect, test } from "vitest";
import {
  canOccupy,
  clampGroupShift,
  gridBounds,
  gridFootprint,
  middleCell,
  nearestFreeCell,
  occupiedCells,
  placeOnCells,
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

  test("respects a grid whose first whole cell is not 0 (cols is an end, not a count)", () => {
    const shifted = { firstCol: 1, firstRow: 1, cols: 10, rows: 8 };
    const single = [{ position: { col: 5, row: 5 }, footprint: one }];
    // Last whole cells: col 9, row 7.
    expect(clampGroupShift(single, { col: 20, row: 20 }, shifted)).toEqual({
      col: 4,
      row: 2,
    });
    expect(clampGroupShift(single, { col: -20, row: -20 }, shifted)).toEqual({
      col: -4,
      row: -4,
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

describe("placeOnCells (T-233c)", () => {
  const bounds = { firstCol: 0, firstRow: 0, cols: 10, rows: 8 };
  const medium = gridFootprint("medium");
  const tiny = gridFootprint("tiny");
  const large = gridFootprint("large");
  const seen = true;

  test("keeps a free wanted cell", () => {
    expect(
      placeOnCells(
        [{ id: "a", wanted: { col: 3, row: 3 }, footprint: medium, seen }],
        [{ position: { col: 5, row: 5 }, footprint: medium, seen }],
        bounds,
      )?.get("a"),
    ).toEqual({ col: 3, row: 3 });
  });

  test("never ends on an occupied cell: the nearest free one instead", () => {
    const cell = placeOnCells(
      [{ id: "a", wanted: { col: 3, row: 3 }, footprint: medium, seen }],
      [{ position: { col: 3, row: 3 }, footprint: medium, seen }],
      bounds,
    )?.get("a");
    expect(cell).not.toEqual({ col: 3, row: 3 });
    expect(
      Math.max(Math.abs((cell?.col ?? 0) - 3), Math.abs((cell?.row ?? 0) - 3)),
    ).toBe(1);
  });

  test("a large token's footprint counts whole, also against a moving group", () => {
    const cells = placeOnCells(
      [
        { id: "ogre", wanted: { col: 2, row: 2 }, footprint: large, seen },
        { id: "rat", wanted: { col: 3, row: 3 }, footprint: medium, seen },
      ],
      [],
      bounds,
    );
    expect(cells?.get("ogre")).toEqual({ col: 2, row: 2 });
    expect(cells?.get("rat")).not.toEqual({ col: 3, row: 3 });
  });

  test("four Tiny tokens share a cell, a fifth goes next door", () => {
    const rats = [1, 2, 3, 4, 5].map((n) => ({
      id: `rat-${String(n)}`,
      wanted: { col: 4, row: 4 },
      footprint: tiny,
      seen,
    }));
    const cells = placeOnCells(rats, [], bounds);
    const onIt = [...(cells?.values() ?? [])].filter(
      (cell) => cell.col === 4 && cell.row === 4,
    );
    expect(onIt).toHaveLength(4);
  });

  test("a token the table does not see never redirects one it sees", () => {
    const cells = placeOnCells(
      [
        { id: "hero", wanted: { col: 3, row: 3 }, footprint: medium, seen },
        {
          id: "lurker",
          wanted: { col: 6, row: 6 },
          footprint: medium,
          seen: false,
        },
      ],
      [{ position: { col: 3, row: 3 }, footprint: medium, seen: false }],
      bounds,
    );
    expect(cells?.get("hero")).toEqual({ col: 3, row: 3 });
    // An unseen one moving onto a seen one is redirected.
    const unseen = placeOnCells(
      [
        {
          id: "lurker",
          wanted: { col: 5, row: 5 },
          footprint: medium,
          seen: false,
        },
      ],
      [{ position: { col: 5, row: 5 }, footprint: medium, seen }],
      bounds,
    );
    expect(unseen?.get("lurker")).not.toEqual({ col: 5, row: 5 });
  });

  test("null when a token finds no room", () => {
    expect(
      placeOnCells(
        [{ id: "a", wanted: { col: 0, row: 0 }, footprint: medium, seen }],
        [{ position: { col: 0, row: 0 }, footprint: medium, seen }],
        { firstCol: 0, firstRow: 0, cols: 1, rows: 1 },
      ),
    ).toBeNull();
  });
});

describe("free tokens take the cells their disc reaches into (T-242)", () => {
  const bounds = { firstCol: 0, firstRow: 0, cols: 10, rows: 8 };
  const medium = gridFootprint("medium");

  test("a Medium at col 2.4 takes cells 2 and 3: a grid move onto 3 goes on", () => {
    const free = [{ position: { col: 2.4, row: 1 }, footprint: medium }];
    expect(canOccupy(free, { col: 3, row: 1 }, medium)).toBe(false);
    expect(canOccupy(free, { col: 2, row: 1 }, medium)).toBe(false);
    expect(canOccupy(free, { col: 4, row: 1 }, medium)).toBe(true);
    expect(
      nearestFreeCell({ col: 3, row: 1 }, medium, free, bounds),
    ).not.toEqual({ col: 3, row: 1 });
  });

  test("barely touching a cell does not take it", () => {
    // Reaches 0.05 into cell 3: not noticeably.
    const free = [{ position: { col: 2.05, row: 1 }, footprint: medium }];
    expect(canOccupy(free, { col: 3, row: 1 }, medium)).toBe(true);
  });

  test("a small disc reaches less far than its footprint", () => {
    // A Tiny token's disc (radius 1/4) centred at 2.9 reaches 0.15 into cell 3.
    const tiny = gridFootprint("tiny");
    const free = [
      { position: { col: 2.4, row: 1 }, footprint: tiny, radius: 0.25 },
    ];
    expect(canOccupy(free, { col: 3, row: 1 }, medium)).toBe(false);
    expect(canOccupy(free, { col: 4, row: 1 }, medium)).toBe(true);
  });
});

describe("a free Tiny token next to Tiny tokens on the grid (T-243)", () => {
  test("takes the cells it reaches into whole: no Tiny token is arranged over it", () => {
    const tiny = gridFootprint("tiny");
    // A free Tiny disc centred at (2.9, 1.5) reaches 0.15 into cell 3.
    const free = [
      { position: { col: 2.4, row: 1 }, footprint: tiny, radius: 0.25 },
    ];
    expect(canOccupy(free, { col: 3, row: 1 }, tiny)).toBe(false);
    expect(canOccupy(free, { col: 4, row: 1 }, tiny)).toBe(true);
  });

  test("Tiny tokens on whole cells still share them by quarters", () => {
    const tiny = gridFootprint("tiny");
    const three = [0, 1, 2].map(() => ({
      position: { col: 3, row: 1 },
      footprint: tiny,
    }));
    expect(canOccupy(three, { col: 3, row: 1 }, tiny)).toBe(true);
  });
});
