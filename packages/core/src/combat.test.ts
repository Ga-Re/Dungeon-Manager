import type { Token } from "@dungeon-manager/schema";
import fc from "fast-check";
import { describe, expect, test } from "vitest";
import {
  apply,
  createHistory,
  execute,
  gridFootprint,
  placeOnCells,
  projectForViewer,
  seenByTable,
  snapToCells,
  undo,
  type ApplyResult,
} from "./index.js";
import { ctx, square, state } from "./test-data.test-data.js";

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

/** `start` with the whole ground floor revealed, or only `area` of it (map pixels, 100 per cell). */
const revealed = (
  start: ReturnType<typeof withTokens>,
  area = square(0, 0, 2000),
) => ({
  ...start,
  scene: {
    ...start.scene,
    fog: { levels: { ground: { revealed: [area], remembered: [] } } },
  },
});

describe("hidden tokens in combat's snap (T-233b)", () => {
  const hiddenToken = (id: string, col: number, row: number): Token => ({
    ...token(id, col, row),
    visibility: { token: "hidden" },
  });

  test("never push a visible token aside: it keeps its cell, the hidden one moves", () => {
    // The hidden one stands exactly on the cell, the visible one only near it: by distance the
    // hidden one would win.
    const result = ok(
      apply(
        revealed(
          withTokens(hiddenToken("lurker", 3, 3), token("hero", 3.2, 3)),
        ),
        { type: "combat.start", bounds },
        ctx,
      ),
    );
    const at = new Map(
      result.state.scene.tokens.map((each) => [each.id, each.position]),
    );
    expect(at.get("hero")).toEqual({ col: 3, row: 3 });
    expect(at.get("lurker")).not.toEqual({ col: 3, row: 3 });
  });

  test("hidden by the campaign's default counts as hidden", () => {
    const start = revealed(
      withTokens(token("lurker", 3, 3), {
        ...token("hero", 3.2, 3),
        visibility: { token: "visible" },
      }),
    );
    const result = ok(
      apply(
        {
          ...start,
          campaign: {
            ...start.campaign,
            visibilityDefaults: { token: "hidden" },
          },
        },
        { type: "combat.start", bounds },
        ctx,
      ),
    );
    expect(result.state.scene.tokens[1]?.position).toEqual({ col: 3, row: 3 });
  });
});

describe("tokens in fog in combat's snap (T-233b review)", () => {
  test("a token in fog never pushes a token the players see aside", () => {
    // Only the cells up to col 3 are revealed; the monster at (4, 3) stands in fog, exactly on
    // its cell, the hero near the same cell but centred in revealed fog.
    const result = ok(
      apply(
        revealed(
          withTokens(token("monster", 4, 3), token("hero", 3.6, 3)),
          square(0, 0, 440),
        ),
        { type: "combat.start", bounds },
        ctx,
      ),
    );
    const at = new Map(
      result.state.scene.tokens.map((each) => [each.id, each.position]),
    );
    expect(at.get("hero")).toEqual({ col: 4, row: 3 });
    expect(at.get("monster")).not.toEqual({ col: 4, row: 3 });
  });
});

describe("free tokens as occupants (T-233b)", () => {
  test("take every cell their disc reaches into (T-242: here 2–3 × 1–2)", () => {
    const cell = snapToCells(
      [
        {
          id: "new",
          position: { col: 2, row: 2 },
          footprint: gridFootprint("medium"),
        },
      ],
      bounds,
      [
        {
          position: { col: 2.3, row: 1.6 },
          footprint: gridFootprint("medium"),
        },
      ],
    )?.get("new");
    // Its disc (centre 2.8, 2.1) takes cells 2–3 × 1–2; the nearest free one is below.
    expect(cell).toEqual({ col: 2, row: 3 });
  });
});

describe("moves onto occupied cells (T-233c)", () => {
  test("a token moved onto another goes to the nearest free cell; without bounds as asked", () => {
    const start = withTokens(token("a", 2, 2), token("b", 5, 5));
    const onTop = { tokenId: "a", to: { col: 5, row: 5 } };
    const placed = ok(
      apply(start, { type: "token.moveMany", moves: [onTop], bounds }, ctx),
    );
    const a = placed.state.scene.tokens[0]?.position;
    expect(a).not.toEqual({ col: 5, row: 5 });
    expect(
      Math.max(Math.abs((a?.col ?? 0) - 5), Math.abs((a?.row ?? 0) - 5)),
    ).toBe(1);
    expect(placed.events[0]).toMatchObject({ type: "token.moved", to: a });
    // Without bounds (no map size known) the move is taken as it is.
    const raw = ok(
      apply(start, { type: "token.moveMany", moves: [onTop] }, ctx),
    );
    expect(raw.state.scene.tokens[0]?.position).toEqual({ col: 5, row: 5 });
  });

  test("a group keeps its formation where there is room", () => {
    const result = ok(
      apply(
        withTokens(token("a", 1, 1), token("b", 2, 1)),
        {
          type: "token.moveMany",
          moves: [
            { tokenId: "a", to: { col: 2, row: 1 } },
            { tokenId: "b", to: { col: 3, row: 1 } },
          ],
          bounds,
        },
        ctx,
      ),
    );
    expect(result.state.scene.tokens.map((each) => each.position)).toEqual([
      { col: 2, row: 1 },
      { col: 3, row: 1 },
    ]);
  });

  test("a token the table does not see never redirects one it sees", () => {
    const start = revealed(
      withTokens(
        { ...token("lurker", 5, 5), visibility: { token: "hidden" } },
        token("hero", 2, 2),
      ),
    );
    const result = ok(
      apply(
        start,
        {
          type: "token.moveMany",
          moves: [{ tokenId: "hero", to: { col: 5, row: 5 } }],
          bounds,
        },
        ctx,
      ),
    );
    expect(result.state.scene.tokens[1]?.position).toEqual({ col: 5, row: 5 });
  });
});

describe("moves onto occupied cells (property, T-233c)", () => {
  test("after any group move no cell holds more than one token's worth", () => {
    const sizes = ["tiny", "small", "medium", "large"] as const;
    fc.assert(
      fc.property(
        fc.array(fc.constantFrom(...sizes), { minLength: 1, maxLength: 10 }),
        fc.array(
          fc.record({
            index: fc.nat(),
            col: fc.integer({ min: 0, max: 9 }),
            row: fc.integer({ min: 0, max: 7 }),
          }),
          { minLength: 1, maxLength: 5 },
        ),
        (tokenSizes, wanted) => {
          // A start without overlaps: combat's snap places them.
          const started = apply(
            withTokens(
              ...tokenSizes.map((size, index) =>
                token(`t${String(index)}`, 0, 0, size),
              ),
            ),
            { type: "combat.start", bounds },
            ctx,
          );
          if (!started.ok) return;
          const moves = [
            ...new Map(
              wanted.map((each) => [
                `t${String(each.index % tokenSizes.length)}`,
                { col: each.col, row: each.row },
              ]),
            ),
          ].map(([tokenId, to]) => ({ tokenId, to }));
          const moved = apply(
            started.state,
            { type: "token.moveMany", moves, bounds },
            ctx,
          );
          if (!moved.ok) return;
          const load = new Map<string, number>();
          for (const each of moved.state.scene.tokens) {
            const footprint = gridFootprint(each.size);
            for (let r = 0; r < footprint.rows; r++)
              for (let c = 0; c < footprint.cols; c++) {
                const key = `${String(each.position.col + c)},${String(each.position.row + r)}`;
                load.set(key, (load.get(key) ?? 0) + footprint.share);
              }
          }
          for (const value of load.values())
            expect(value).toBeLessThanOrEqual(1 + 1e-9);
        },
      ),
    );
  });
});

describe("moves: seen where it stands or where it goes (T-233c review)", () => {
  // Cells up to col 3, row 3 are revealed (their centres lie in it); the rest is fog.
  const half = (start: ReturnType<typeof withTokens>) =>
    revealed(start, square(0, 0, 440));
  const move = (tokenId: string, col: number, row: number) => ({
    type: "token.moveMany" as const,
    moves: [{ tokenId, to: { col, row } }],
    bounds,
  });

  test("a token coming out of the fog is not redirected by an unseen one where it arrives", () => {
    const start = half(
      withTokens(
        { ...token("lurker", 2, 2), visibility: { token: "hidden" } },
        token("hero", 6, 6),
      ),
    );
    const result = ok(apply(start, move("hero", 2, 2), ctx));
    expect(result.state.scene.tokens[1]?.position).toEqual({ col: 2, row: 2 });
  });

  test("a seen token going into the fog is not redirected by an unseen one there", () => {
    const start = half(withTokens(token("monster", 6, 6), token("hero", 1, 1)));
    const result = ok(apply(start, move("hero", 6, 6), ctx));
    expect(result.state.scene.tokens[1]?.position).toEqual({ col: 6, row: 6 });
  });

  test("of equally near free cells the one nearest to where it came from wins", () => {
    const start = withTokens(token("a", 3, 3), token("b", 5, 3));
    const result = ok(apply(start, move("a", 5, 3), ctx));
    expect(result.state.scene.tokens[0]?.position).toEqual({ col: 4, row: 3 });
  });

  test("a move that ends where it began changes nothing, and records no step", () => {
    const start = withTokens(token("a", 4, 3), token("b", 5, 3));
    const result = ok(apply(start, move("a", 5, 3), ctx));
    expect(result.state).toBe(start);
    expect(result.events).toEqual([]);
  });

  test("a wanted cell off the map's edge is not taken", () => {
    const cell = placeOnCells(
      [
        {
          id: "ogre",
          wanted: { col: 9, row: 7 },
          footprint: gridFootprint("large"),
          seen: true,
        },
      ],
      [],
      bounds,
    )?.get("ogre");
    expect(cell).toEqual({ col: 8, row: 6 });
  });

  test("property: with fog and hidden tokens, no cell holds more than one seen token's worth", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            size: fc.constantFrom("tiny", "medium", "large"),
            hidden: fc.boolean(),
          }),
          { minLength: 1, maxLength: 10 },
        ),
        fc.array(
          fc.record({
            index: fc.nat(),
            col: fc.integer({ min: 0, max: 9 }),
            row: fc.integer({ min: 0, max: 7 }),
          }),
          { minLength: 1, maxLength: 5 },
        ),
        (specs, wanted) => {
          const started = apply(
            half(
              withTokens(
                ...specs.map((spec, index) => ({
                  ...token(`t${String(index)}`, 0, 0, spec.size),
                  ...(spec.hidden && {
                    visibility: { token: "hidden" as const },
                  }),
                })),
              ),
            ),
            { type: "combat.start", bounds },
            ctx,
          );
          if (!started.ok) return;
          const moves = [
            ...new Map(
              wanted.map((each) => [
                `t${String(each.index % specs.length)}`,
                { col: each.col, row: each.row },
              ]),
            ),
          ].map(([tokenId, to]) => ({ tokenId, to }));
          const moved = apply(
            started.state,
            { type: "token.moveMany", moves, bounds },
            ctx,
          );
          if (!moved.ok) return;
          const load = new Map<string, number>();
          for (const each of moved.state.scene.tokens) {
            if (!seenByTable(moved.state, each)) continue;
            const footprint = gridFootprint(each.size);
            for (let r = 0; r < footprint.rows; r++)
              for (let c = 0; c < footprint.cols; c++) {
                const key = `${String(each.position.col + c)},${String(each.position.row + r)}`;
                load.set(key, (load.get(key) ?? 0) + footprint.share);
              }
          }
          for (const value of load.values())
            expect(value).toBeLessThanOrEqual(1 + 1e-9);
        },
      ),
    );
  });
});
