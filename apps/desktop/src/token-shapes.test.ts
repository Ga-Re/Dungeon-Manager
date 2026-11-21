import { describe, expect, it } from "vitest";
import { tokenShapes } from "./token-shapes.js";

// Tokens in map pixels (T-107a), from the map's grid and their footprint.

const grid = { cellSizePx: 100, offsetXPx: 10, offsetYPx: 20 };
const token = (
  id: string,
  size: "tiny" | "small" | "medium" | "large",
  levelId = "ground",
) => ({
  id,
  name: id,
  size,
  position: { col: 2, row: 1 },
  levelId,
});

describe("token shapes", () => {
  it("cover their footprint from their cell, on the grid's offset", () => {
    expect(tokenShapes([token("a", "medium")], grid, "ground")).toEqual([
      {
        id: "a",
        name: "a",
        x: 210,
        y: 120,
        width: 100,
        height: 100,
      },
    ]);
    expect(tokenShapes([token("b", "large")], grid, "ground")[0]).toMatchObject(
      {
        width: 200,
        height: 200,
      },
    );
  });

  it("draw a Tiny token in the middle half of its cell", () => {
    expect(tokenShapes([token("c", "tiny")], grid, "ground")[0]).toMatchObject({
      x: 235,
      y: 145,
      width: 50,
      height: 50,
    });
  });

  it("leave out tokens of other levels", () => {
    expect(
      tokenShapes([token("d", "medium", "cellar")], grid, "ground"),
    ).toEqual([]);
  });

  it("mark selected tokens and tokens hidden from the players (T-107b)", () => {
    const hidden = {
      ...token("e", "medium"),
      visibility: { token: "hidden" as const },
    };
    expect(
      tokenShapes(
        [token("a", "medium"), hidden],
        grid,
        "ground",
        new Set(["a"]),
      ).map(({ id, selected, hidden }) => ({ id, selected, hidden })),
    ).toEqual([
      { id: "a", selected: true, hidden: undefined },
      { id: "e", selected: undefined, hidden: true },
    ]);
  });

  it("fade tokens the campaign hides by default, unless shown on their own (T-107b)", () => {
    const shown = {
      ...token("f", "medium"),
      visibility: { token: "visible" as const },
    };
    expect(
      tokenShapes([token("a", "medium"), shown], grid, "ground", undefined, {
        token: "hidden",
      }).map(({ id, hidden }) => ({ id, hidden })),
    ).toEqual([
      { id: "a", hidden: true },
      { id: "f", hidden: undefined },
    ]);
  });

  it("arrange Tiny tokens sharing a cell by count (T-233c)", () => {
    const rat = (id: string) => token(id, "tiny");
    const centres = (count: number) =>
      tokenShapes(
        ["a", "b", "c", "d"].slice(0, count).map(rat),
        grid,
        "ground",
      ).map((shape) => [shape.x + shape.width / 2, shape.y + shape.height / 2]);
    // The cell (2, 1) spans x 210–310, y 120–220.
    expect(centres(1)).toEqual([[260, 170]]);
    expect(centres(2)).toEqual([
      [235, 170],
      [285, 170],
    ]);
    expect(centres(3)).toEqual([
      [235, 145],
      [285, 145],
      [260, 195],
    ]);
    expect(centres(4)).toEqual([
      [235, 145],
      [285, 145],
      [235, 195],
      [285, 195],
    ]);
  });

  it("draw a Small token at 75 % of its cell, centred (T-233c)", () => {
    expect(tokenShapes([token("s", "small")], grid, "ground")[0]).toMatchObject(
      {
        x: 222.5,
        y: 132.5,
        width: 75,
        height: 75,
      },
    );
  });

  it("mark the token whose turn it is (T-111c)", () => {
    expect(
      tokenShapes(
        [token("a", "medium"), token("b", "medium")],
        grid,
        "ground",
        undefined,
        undefined,
        "b",
      ).map(({ id, active }) => ({ id, active })),
    ).toEqual([
      { id: "a", active: undefined },
      { id: "b", active: true },
    ]);
  });
});
