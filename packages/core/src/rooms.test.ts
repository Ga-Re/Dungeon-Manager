import { describe, expect, test } from "vitest";
import { newRoomId, roomsOnLevel, snapArea } from "./index.js";

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

describe("roomsOnLevel", () => {
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
    expect(roomsOnLevel(rooms, levels, "ground").map((r) => r.id)).toEqual([
      "hall",
    ]);
    expect(roomsOnLevel(rooms, levels, "cellar").map((r) => r.id)).toEqual([
      "vault",
    ]);
  });
});

describe("newRoomId", () => {
  test("is unique among the map's levels and rooms", () => {
    expect(newRoomId(["ground", "room-1", "room-3"])).toBe("room-2");
    expect(newRoomId([])).toBe("room-1");
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
