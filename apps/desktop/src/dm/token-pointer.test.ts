import { describe, expect, test } from "vitest";
import type { Camera } from "@dungeon-manager/renderer";
import { arrowStep, dragCells, tapShift, tokenAt } from "./token-pointer.js";

const grid = { cellSizePx: 100, offsetXPx: 10, offsetYPx: 20 };
const medium = { id: "m", x: 110, y: 220, width: 100, height: 100 };
const large = { id: "l", x: 310, y: 220, width: 200, height: 200 };
const tiny = { id: "t", x: 135, y: 245, width: 50, height: 50 };

describe("tokenAt", () => {
  test("finds the disc under the point, the one drawn last on top", () => {
    expect(tokenAt([medium, large], { x: 160, y: 270 })?.id).toBe("m");
    expect(tokenAt([medium, tiny], { x: 160, y: 270 })?.id).toBe("t");
    // A footprint's corner lies outside its disc.
    expect(tokenAt([medium], { x: 112, y: 222 })).toBeNull();
    expect(tokenAt([], { x: 0, y: 0 })).toBeNull();
  });
});

describe("dragCells", () => {
  test("snaps a drag to whole cells", () => {
    expect(dragCells({ x: 0, y: 0 }, { x: 40, y: -40 }, grid)).toEqual({
      col: 0,
      row: 0,
    });
    expect(dragCells({ x: 0, y: 0 }, { x: 160, y: -260 }, grid)).toEqual({
      col: 2,
      row: -3,
    });
  });
});

describe("tapShift", () => {
  test("puts a token on the tapped cell", () => {
    // medium stands on cell (1, 2); (4, 5) is tapped.
    expect(tapShift(medium, { x: 450, y: 560 }, grid)).toEqual({
      col: 3,
      row: 3,
    });
    expect(tapShift(tiny, { x: 450, y: 560 }, grid)).toEqual({
      col: 3,
      row: 3,
    });
    expect(tapShift(medium, { x: 150, y: 260 }, grid)).toEqual({
      col: 0,
      row: 0,
    });
  });

  test("centres a large token on the tapped cell", () => {
    // large covers (3, 2)–(4, 3); tapping (6, 6) puts it on (5, 5)–(6, 6), over the tapped
    // cell (2 × 2 has no middle cell).
    expect(tapShift(large, { x: 650, y: 660 }, grid)).toEqual({
      col: 2,
      row: 3,
    });
  });
});

describe("arrowStep", () => {
  const view = { width: 800, height: 600 };
  const camera = (rotation: Camera["rotation"]): Camera => ({
    centerX: 0,
    centerY: 0,
    zoom: 2,
    rotation,
  });

  test("moves one cell in the arrow's direction on screen", () => {
    expect(arrowStep("ArrowUp", camera(0), view)).toEqual({ col: 0, row: -1 });
    expect(arrowStep("ArrowRight", camera(0), view)).toEqual({
      col: 1,
      row: 0,
    });
    expect(arrowStep("x", camera(0), view)).toBeNull();
  });

  test("follows a rotated view: up stays up on screen", () => {
    // Turned a quarter clockwise, the map's left edge is at the top of the screen.
    expect(arrowStep("ArrowUp", camera(90), view)).toEqual({ col: -1, row: 0 });
    expect(arrowStep("ArrowRight", camera(90), view)).toEqual({
      col: 0,
      row: -1,
    });
    expect(arrowStep("ArrowUp", camera(180), view)).toEqual({ col: 0, row: 1 });
  });
});
