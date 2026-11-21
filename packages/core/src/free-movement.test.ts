import type { Token } from "@dungeon-manager/schema";
import fc from "fast-check";
import { describe, expect, test } from "vitest";
import {
  apply,
  discRadius,
  gridFootprint,
  placeFree,
  type ApplyResult,
} from "./index.js";
import { ctx, state } from "./test-data.test-data.js";

// Free movement (T-233d): tokens stay where they are put, never overlapping another's disc.

const bounds = { firstCol: 0, firstRow: 0, cols: 10, rows: 8 };
const disc = (size: Token["size"]) => {
  const footprint = gridFootprint(size);
  return { footprint, radius: discRadius(size, footprint) };
};
const token = (id: string, col: number, row: number): Token => ({
  id,
  name: id,
  size: "medium",
  position: { col, row },
  levelId: "ground",
});
const withTokens = (...tokens: Token[]) => ({
  ...state,
  scene: { ...state.scene, tokens },
});
function ok(result: ApplyResult) {
  if (!result.ok) throw new Error(`rejected: ${result.reason}`);
  return result;
}
const centreDistance = (
  a: { col: number; row: number },
  b: { col: number; row: number },
) => Math.hypot(a.col - b.col, a.row - b.row);

describe("placeFree", () => {
  test("keeps a free spot as it is, between cells", () => {
    expect(
      placeFree(
        [
          {
            id: "a",
            wanted: { col: 2.3, row: 1.6 },
            ...disc("medium"),
            seen: true,
          },
        ],
        [{ position: { col: 5, row: 5 }, ...disc("medium"), seen: true }],
        bounds,
      )?.get("a"),
    ).toEqual({ col: 2.3, row: 1.6 });
  });

  test("pushes a token dropped onto another just far enough away, towards where it came from", () => {
    const placed = placeFree(
      [
        {
          id: "a",
          wanted: { col: 5.2, row: 5 },
          from: { col: 8, row: 5 },
          ...disc("medium"),
          seen: true,
        },
      ],
      [{ position: { col: 5, row: 5 }, ...disc("medium"), seen: true }],
      bounds,
    )?.get("a");
    if (!placed) throw new Error("no spot");
    // Two medium discs touch at one cell between their centres.
    expect(centreDistance(placed, { col: 5, row: 5 })).toBeGreaterThanOrEqual(
      0.999,
    );
    expect(centreDistance(placed, { col: 5, row: 5 })).toBeLessThan(1.06);
    expect(placed.col).toBeGreaterThan(5);
  });

  test("stays on the map", () => {
    const placed = placeFree(
      [
        {
          id: "a",
          wanted: { col: 9.6, row: -0.2 },
          ...disc("medium"),
          seen: true,
        },
      ],
      [],
      bounds,
    )?.get("a");
    expect(placed?.col).toBeLessThanOrEqual(9);
    expect(placed?.row).toBeGreaterThanOrEqual(0);
  });

  test("a token the table does not see never pushes one it sees", () => {
    expect(
      placeFree(
        [
          {
            id: "hero",
            wanted: { col: 3, row: 3 },
            ...disc("medium"),
            seen: true,
          },
        ],
        [{ position: { col: 3, row: 3 }, ...disc("medium"), seen: false }],
        bounds,
      )?.get("hero"),
    ).toEqual({ col: 3, row: 3 });
  });

  test("property: no two placed or standing discs overlap", () => {
    const sizes = ["tiny", "small", "medium", "large"] as const;
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            size: fc.constantFrom(...sizes),
            col: fc.double({ min: 0, max: 8, noNaN: true }),
            row: fc.double({ min: 0, max: 6, noNaN: true }),
          }),
          { minLength: 1, maxLength: 8 },
        ),
        (wanted) => {
          const moving = wanted.map((each, index) => ({
            id: String(index),
            wanted: { col: each.col, row: each.row },
            ...disc(each.size),
            seen: true,
          }));
          const placed = placeFree(moving, [], bounds);
          if (!placed) return;
          const discs = moving.map((each) => {
            const at = placed.get(each.id);
            if (!at) throw new Error("missing");
            expect(at.col).toBeGreaterThanOrEqual(0);
            expect(at.col + each.footprint.cols).toBeLessThanOrEqual(
              bounds.cols,
            );
            return {
              x: at.col + each.footprint.cols / 2,
              y: at.row + each.footprint.rows / 2,
              r: each.radius,
            };
          });
          for (let i = 0; i < discs.length; i++)
            for (let j = i + 1; j < discs.length; j++) {
              const a = discs[i];
              const b = discs[j];
              if (!a || !b) continue;
              expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThanOrEqual(
                a.r + b.r - 2e-3,
              );
            }
        },
      ),
    );
  });
});

describe("free moves and the grid mode", () => {
  test("a free move keeps its spot between cells; onto another it is pushed off", () => {
    const start = withTokens(token("a", 1, 1), token("b", 5, 5));
    const moved = ok(
      apply(
        start,
        {
          type: "token.moveMany",
          moves: [{ tokenId: "a", to: { col: 2.4, row: 1.7 } }],
          bounds,
          free: true,
        },
        ctx,
      ),
    );
    expect(moved.state.scene.tokens[0]?.position).toEqual({
      col: 2.4,
      row: 1.7,
    });
    const pushed = ok(
      apply(
        start,
        {
          type: "token.moveMany",
          moves: [{ tokenId: "a", to: { col: 5.3, row: 5 } }],
          bounds,
          free: true,
        },
        ctx,
      ),
    );
    const a = pushed.state.scene.tokens[0]?.position;
    if (!a) throw new Error("no position");
    expect(centreDistance(a, { col: 5, row: 5 })).toBeGreaterThanOrEqual(0.999);
  });

  test("scene.setGridMode sets, clears and keeps the scene's mode", () => {
    const set = ok(
      apply(state, { type: "scene.setGridMode", gridMode: "free" }, ctx),
    );
    expect(set.state.scene.gridMode).toBe("free");
    expect(set.events).toEqual([
      expect.objectContaining({ type: "gridMode.changed", gridMode: "free" }),
    ]);
    const same = ok(
      apply(set.state, { type: "scene.setGridMode", gridMode: "free" }, ctx),
    );
    expect(same.state).toBe(set.state);
    const cleared = ok(
      apply(set.state, { type: "scene.setGridMode", gridMode: null }, ctx),
    );
    expect("gridMode" in cleared.state.scene).toBe(false);
  });
});
