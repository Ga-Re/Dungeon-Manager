import type { Token } from "@dungeon-manager/schema";
import fc from "fast-check";
import { describe, expect, test } from "vitest";
import {
  apply,
  createHistory,
  execute,
  gridFootprint,
  projectForViewer,
  snapToCells,
  undo,
  type ApplyResult,
} from "./index.js";
import { ctx, state } from "./test-data.test-data.js";

// Combat (T-233): starting one snaps every token to a free cell in one step.

const bounds = { firstCol: 0, firstRow: 0, cols: 10, rows: 8 };
const token = (
  id: string,
  col: number,
  row: number,
  size: Token["size"] = "medium",
  levelId = "ground",
): Token => ({ id, name: id, size, position: { col, row }, levelId });
const withTokens = (...tokens: Token[]) => ({
  ...state,
  scene: { ...state.scene, tokens },
});
function ok(result: ApplyResult) {
  if (!result.ok) throw new Error(`rejected: ${result.reason}`);
  return result;
}

describe("combat.start", () => {
  test("snaps free tokens to their nearest cells and marks the scene in combat", () => {
    const result = ok(
      apply(
        withTokens(token("a", 2.3, 1.6), token("b", 5, 5)),
        { type: "combat.start", bounds },
        ctx,
      ),
    );
    expect(result.state.scene.combat).toBe(true);
    expect(result.state.scene.tokens.map((each) => each.position)).toEqual([
      { col: 2, row: 2 },
      { col: 5, row: 5 },
    ]);
    // Only the token that moved reports a move.
    expect(result.events.map((event) => event.type)).toEqual([
      "combat.changed",
      "token.moved",
    ]);
  });

  test("the token nearest to a cell keeps it; the other goes to the nearest free one", () => {
    const result = ok(
      apply(
        withTokens(token("far", 3.4, 3), token("near", 3.1, 3)),
        { type: "combat.start", bounds },
        ctx,
      ),
    );
    const at = new Map(
      result.state.scene.tokens.map((each) => [each.id, each.position]),
    );
    expect(at.get("near")).toEqual({ col: 3, row: 3 });
    expect(at.get("far")).not.toEqual({ col: 3, row: 3 });
    const far = at.get("far");
    expect(
      Math.max(Math.abs((far?.col ?? 0) - 3), Math.abs((far?.row ?? 0) - 3)),
    ).toBe(1);
  });

  test("up to four Tiny tokens share a cell; a large token claims its footprint", () => {
    const tiny = [1, 2, 3, 4, 5].map((n) =>
      token(`rat-${String(n)}`, 4, 4, "tiny"),
    );
    const result = ok(
      apply(
        withTokens(...tiny, token("ogre", 4.2, 4.2, "large")),
        { type: "combat.start", bounds },
        ctx,
      ),
    );
    const positions = result.state.scene.tokens.map(
      (each) => `${String(each.position.col)},${String(each.position.row)}`,
    );
    expect(positions.filter((cell) => cell === "4,4")).toHaveLength(4);
    // The ogre covers 2 × 2 cells, none of them the rats' cell.
    const ogre = result.state.scene.tokens.at(-1)?.position;
    if (!ogre) throw new Error("no ogre");
    const coversRats =
      ogre.col <= 4 && 4 < ogre.col + 2 && ogre.row <= 4 && 4 < ogre.row + 2;
    expect(coversRats).toBe(false);
  });

  test("levels never share space", () => {
    const result = ok(
      apply(
        withTokens(token("up", 2, 2), token("down", 2, 2, "medium", "cellar")),
        { type: "combat.start", bounds },
        ctx,
      ),
    );
    expect(result.state.scene.tokens.map((each) => each.position)).toEqual([
      { col: 2, row: 2 },
      { col: 2, row: 2 },
    ]);
  });

  test("refuses when a token finds no room", () => {
    const tight = { firstCol: 0, firstRow: 0, cols: 1, rows: 1 };
    expect(
      apply(
        withTokens(token("a", 0, 0), token("b", 0, 0)),
        { type: "combat.start", bounds: tight },
        ctx,
      ),
    ).toEqual({ ok: false, reason: "noFreeCell" });
  });

  test("one undo restores every position and ends the combat again", () => {
    const start = withTokens(token("a", 2.3, 1.6), token("b", 2.4, 1.6));
    const started = execute(
      start,
      createHistory(),
      { type: "combat.start", bounds },
      ctx,
    );
    if (!started.ok) throw new Error("rejected");
    const undone = undo(started.state, started.history);
    expect(undone?.state.scene).toEqual(start.scene);
  });

  test("the TV learns of the combat", () => {
    const started = ok(
      apply(withTokens(), { type: "combat.start", bounds }, ctx),
    ).state;
    expect(projectForViewer(started, { kind: "table" }).combat).toBe(true);
    const ended = ok(apply(started, { type: "combat.end" }, ctx));
    expect(ended.state.scene.combat).toBeUndefined();
    expect(ended.events).toEqual([
      expect.objectContaining({ type: "combat.changed", combat: false }),
    ]);
    expect(
      projectForViewer(ended.state, { kind: "table" }).combat,
    ).toBeUndefined();
  });

  test("starting a running combat with every token on its cell changes nothing", () => {
    const running = ok(
      apply(
        withTokens(token("a", 2.4, 2)),
        { type: "combat.start", bounds },
        ctx,
      ),
    ).state;
    const again = ok(apply(running, { type: "combat.start", bounds }, ctx));
    expect(again.state).toBe(running);
    expect(again.events).toEqual([]);
  });

  test("ending no combat changes nothing", () => {
    const result = ok(apply(state, { type: "combat.end" }, ctx));
    expect(result.state).toBe(state);
    expect(result.events).toEqual([]);
  });
});

describe("free positions (T-233)", () => {
  test("a token may stand between cells, never off the grid or nowhere", () => {
    const moved = ok(
      apply(
        state,
        {
          type: "token.move",
          tokenId: "token-aria",
          to: { col: 2.5, row: 0.25 },
        },
        ctx,
      ),
    );
    expect(moved.state.scene.tokens[1]?.position).toEqual({
      col: 2.5,
      row: 0.25,
    });
    for (const to of [
      { col: Number.NaN, row: 0 },
      { col: Infinity, row: 0 },
      { col: -0.5, row: 0 },
    ])
      expect(
        apply(state, { type: "token.move", tokenId: "token-aria", to }, ctx),
      ).toEqual({ ok: false, reason: "invalidCell" });
  });
});

describe("snapToCells (property)", () => {
  const sizes = ["tiny", "small", "medium", "large", "huge"] as const;
  const tokens = fc.array(
    fc.record({
      size: fc.constantFrom(...sizes),
      col: fc.double({ min: 0, max: 11, noNaN: true }),
      row: fc.double({ min: 0, max: 9, noNaN: true }),
    }),
    { maxLength: 14 },
  );

  test("every token gets whole cells inside the map; no cell holds more than one token's worth", () => {
    fc.assert(
      fc.property(tokens, (list) => {
        const input = list.map((each, index) => ({
          id: String(index),
          position: { col: each.col, row: each.row },
          footprint: gridFootprint(each.size),
        }));
        const cells = snapToCells(input, bounds);
        if (!cells) return; // No room: the command is rejected, nothing moves.
        const load = new Map<string, number>();
        for (const each of input) {
          const cell = cells.get(each.id);
          expect(cell).toBeDefined();
          if (!cell) return;
          expect(Number.isInteger(cell.col) && Number.isInteger(cell.row)).toBe(
            true,
          );
          expect(cell.col).toBeGreaterThanOrEqual(0);
          expect(cell.row).toBeGreaterThanOrEqual(0);
          expect(cell.col + each.footprint.cols).toBeLessThanOrEqual(
            bounds.cols,
          );
          expect(cell.row + each.footprint.rows).toBeLessThanOrEqual(
            bounds.rows,
          );
          for (let r = 0; r < each.footprint.rows; r++)
            for (let c = 0; c < each.footprint.cols; c++) {
              const key = `${String(cell.col + c)},${String(cell.row + r)}`;
              load.set(key, (load.get(key) ?? 0) + each.footprint.share);
            }
        }
        for (const value of load.values())
          expect(value).toBeLessThanOrEqual(1 + 1e-9);
      }),
    );
  });

  test("a token already alone on a cell stays there", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 9 }),
        fc.integer({ min: 0, max: 7 }),
        (col, row) => {
          const cells = snapToCells(
            [
              {
                id: "a",
                position: { col, row },
                footprint: gridFootprint("medium"),
              },
            ],
            bounds,
          );
          expect(cells?.get("a")).toEqual({ col, row });
        },
      ),
    );
  });
});
