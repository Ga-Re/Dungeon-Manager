import type { Token } from "@dungeon-manager/schema";
import fc from "fast-check";
import { describe, expect, test } from "vitest";
import {
  apply,
  discRadius,
  gridFootprint,
  placeFree,
  tinyCentres,
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

  test("keeps clear of Tiny tokens where they are drawn, off their cell's middle (T-233d review)", () => {
    // Two Tiny tokens on (5, 5) are drawn side by side, centred at 5.25 and 5.75.
    const start = withTokens(
      { ...token("rat-1", 5, 5), size: "tiny" },
      { ...token("rat-2", 5, 5), size: "tiny" },
      token("hero", 1, 1),
    );
    const result = ok(
      apply(
        start,
        {
          type: "token.moveMany",
          moves: [{ tokenId: "hero", to: { col: 4.25, row: 5 } }],
          bounds,
          free: true,
        },
        ctx,
      ),
    );
    const hero = result.state.scene.tokens[2]?.position;
    if (!hero) throw new Error("no hero");
    // The hero's centre is 0.5 + 0.25 away from the left rat's drawn centre at least.
    expect(
      Math.hypot(hero.col + 0.5 - 5.25, hero.row + 0.5 - 5.5),
    ).toBeGreaterThanOrEqual(0.749);
  });

  test("finds an exact gap of one cell between tokens on cells: never stricter than the grid", () => {
    // A ring of tokens around the free cell (3, 3).
    const ring = [-1, 0, 1].flatMap((dc) =>
      [-1, 0, 1]
        .filter((dr) => dc !== 0 || dr !== 0)
        .map((dr) => ({
          position: { col: 3 + dc, row: 3 + dr },
          ...disc("medium"),
          seen: true,
        })),
    );
    expect(
      placeFree(
        [
          {
            id: "a",
            wanted: { col: 3.3, row: 3.2 },
            ...disc("medium"),
            seen: true,
          },
        ],
        ring,
        bounds,
      )?.get("a"),
    ).toEqual({ col: 3, row: 3 });
  });

  test("tinyCentres arranges Tiny tokens on a cell by count, a free one in its middle", () => {
    const tiny = (id: string, col: number, row: number) => ({
      id,
      size: "tiny" as const,
      position: { col, row },
    });
    const centres = tinyCentres([
      tiny("a", 2, 2),
      tiny("b", 2, 2),
      tiny("c", 2, 2),
      tiny("free", 4.3, 1.2),
    ]);
    expect([...centres.values()]).toEqual([
      { col: 2.25, row: 2.25 },
      { col: 2.75, row: 2.25 },
      { col: 2.5, row: 2.75 },
      { col: 4.8, row: 1.7 },
    ]);
  });

  test("property: seen tokens clear seen ones, unseen ones clear all; room is found on a roomy map", () => {
    const sizes = ["tiny", "small", "medium", "large"] as const;
    const spec = fc.record({
      size: fc.constantFrom(...sizes),
      col: fc.double({ min: 0, max: 8, noNaN: true }),
      row: fc.double({ min: 0, max: 6, noNaN: true }),
      seen: fc.boolean(),
    });
    fc.assert(
      fc.property(
        fc.array(spec, { minLength: 1, maxLength: 6 }),
        fc.array(spec, { maxLength: 6 }),
        (wanted, standingSpecs) => {
          // Standing tokens never overlap one another: placed first, freely.
          const standingPlaced = placeFree(
            standingSpecs.map((each, index) => ({
              id: `s${String(index)}`,
              wanted: { col: each.col, row: each.row },
              ...disc(each.size),
              seen: true,
            })),
            [],
            bounds,
          );
          expect(standingPlaced).not.toBeNull();
          const standing = standingSpecs.map((each, index) => {
            const position = standingPlaced?.get(`s${String(index)}`);
            if (!position) throw new Error("missing");
            return { position, ...disc(each.size), seen: each.seen };
          });
          const moving = wanted.map((each, index) => ({
            id: String(index),
            wanted: { col: each.col, row: each.row },
            ...disc(each.size),
            seen: each.seen,
          }));
          const placed = placeFree(moving, standing, bounds);
          // At most twelve tokens on a 10 × 8 map: there is always room.
          expect(placed).not.toBeNull();
          const discOf = (
            at: { col: number; row: number },
            each: { footprint: { cols: number; rows: number }; radius: number },
          ) => ({
            x: at.col + each.footprint.cols / 2,
            y: at.row + each.footprint.rows / 2,
            r: each.radius,
          });
          const all = [
            ...standing.map((each) => ({
              ...discOf(each.position, each),
              seen: each.seen,
              moved: false,
            })),
            ...moving.map((each) => {
              const at = placed?.get(each.id);
              if (!at) throw new Error("missing");
              expect(at.col).toBeGreaterThanOrEqual(0);
              expect(at.col + each.footprint.cols).toBeLessThanOrEqual(
                bounds.cols,
              );
              expect(at.row + each.footprint.rows).toBeLessThanOrEqual(
                bounds.rows,
              );
              return { ...discOf(at, each), seen: each.seen, moved: true };
            }),
          ];
          for (const a of all)
            for (const b of all) {
              if (a === b || !a.moved) continue;
              // A seen mover ignores unseen tokens; an unseen one clears everything.
              if (a.seen && !b.seen) continue;
              // Movers are placed one after another; a seen one does not see unseen movers.
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
