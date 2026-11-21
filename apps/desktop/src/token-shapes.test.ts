import { describe, expect, it } from "vitest";
import { tokenShapes } from "./token-shapes.js";

// Tokens in map pixels (T-107a), from the map's grid and their footprint.

const grid = { cellSizePx: 100, offsetXPx: 10, offsetYPx: 20 };
const token = (
  id: string,
  size: "tiny" | "medium" | "large",
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
});
