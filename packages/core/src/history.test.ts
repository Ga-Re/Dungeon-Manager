import { describe, expect, test } from "vitest";
import {
  createHistory,
  execute,
  HISTORY_LIMIT,
  record,
  redo,
  undo,
  type Command,
} from "./index.js";
import { ctx, square, state } from "./test-data.test-data.js";

const move = (col: number): Command => ({
  type: "token.move",
  tokenId: "token-goblin",
  to: { col, row: 0 },
});
const goblinCol = (s: typeof state) => s.scene.tokens[0]?.position.col;

describe("history", () => {
  test("undo restores the previous state and redo re-applies it", () => {
    const first = execute(state, createHistory(), move(3), ctx);
    if (!first.ok) throw new Error(first.reason);
    const second = execute(
      first.state,
      first.history,
      { type: "fog.reveal", levelId: "ground", area: square(0, 0, 10) },
      ctx,
    );
    if (!second.ok) throw new Error(second.reason);

    const undone = undo(second.state, second.history);
    expect(undone?.state).toBe(first.state);
    const undoneTwice = undone && undo(undone.state, undone.history);
    expect(undoneTwice?.state).toBe(state);

    const redone = undoneTwice && redo(undoneTwice.state, undoneTwice.history);
    expect(redone?.state).toBe(first.state);
  });

  test("a new command clears the redo stack", () => {
    const first = execute(state, createHistory(), move(3), ctx);
    if (!first.ok) throw new Error(first.reason);
    const undone = undo(first.state, first.history);
    if (!undone) throw new Error("nothing to undo");
    const other = execute(undone.state, undone.history, move(5), ctx);
    if (!other.ok) throw new Error(other.reason);

    expect(redo(other.state, other.history)).toBeNull();
    expect(goblinCol(other.state)).toBe(5);
  });

  test("rejected commands do not touch the history", () => {
    const history = createHistory();
    expect(
      execute(
        state,
        history,
        { type: "token.move", tokenId: "nope", to: { col: 0, row: 0 } },
        ctx,
      ),
    ).toEqual({
      ok: false,
      reason: "unknownToken",
    });
    expect(undo(state, history)).toBeNull();
  });

  test("keeps at most HISTORY_LIMIT undo steps", () => {
    let current = state;
    let history = createHistory();
    for (let col = 1; col <= HISTORY_LIMIT + 5; col++) {
      const result = execute(current, history, move(col), ctx);
      if (!result.ok) throw new Error(result.reason);
      ({ state: current, history } = result);
    }
    expect(history.past).toHaveLength(HISTORY_LIMIT);

    let steps = 0;
    for (
      let undone = undo(current, history);
      undone;
      undone = undo(undone.state, undone.history)
    )
      steps++;
    expect(steps).toBe(HISTORY_LIMIT);
  });

  test("nothing to undo or redo on a fresh history", () => {
    expect(undo(state, createHistory())).toBeNull();
    expect(redo(state, createHistory())).toBeNull();
  });
});

describe("history of the TV's level", () => {
  test("undo restores the previous level and release", () => {
    const shown = execute(
      state,
      createHistory(),
      { type: "level.show", levelId: "cellar" },
      ctx,
    );
    if (!shown.ok) throw new Error(shown.reason);
    expect(undo(shown.state, shown.history)?.state.scene.table).toBeUndefined();
  });

  test("showing the level already on the TV adds no undo step", () => {
    const shown = execute(
      state,
      createHistory(),
      { type: "level.show", levelId: "cellar" },
      ctx,
    );
    if (!shown.ok) throw new Error(shown.reason);
    const again = execute(
      shown.state,
      shown.history,
      { type: "level.show", levelId: "cellar" },
      ctx,
    );
    if (!again.ok) throw new Error(again.reason);
    expect(again.state).toBe(shown.state);
    expect(again.history).toBe(shown.history);
    expect(again.events).toEqual([]);
  });
});

describe("history of any document (T-174)", () => {
  // A document other than a scene, e.g. an asset's name: snapshots of its own state.
  interface Asset {
    readonly name: string;
  }

  test("records snapshots of a document and steps back and forth through them", () => {
    let history = createHistory<Asset>();
    let asset: Asset = { name: "Fass" };
    history = record(history, asset);
    asset = { name: "Fass, leer" };
    const back = undo(asset, history);
    expect(back?.state).toEqual({ name: "Fass" });
    if (!back) throw new Error("nothing to undo");
    expect(redo(back.state, back.history)?.state).toEqual({
      name: "Fass, leer",
    });
  });

  test("a new change clears redo, and only the newest steps are kept", () => {
    let history = createHistory<number>();
    for (let step = 0; step < HISTORY_LIMIT + 5; step++)
      history = record(history, step);
    expect(history.past).toHaveLength(HISTORY_LIMIT);
    expect(history.past[0]).toBe(5);
    const back = undo(HISTORY_LIMIT + 5, history);
    if (!back) throw new Error("nothing to undo");
    expect(record(back.history, 0).future).toEqual([]);
  });

  test("histories of two documents are independent", () => {
    const scene = record(createHistory<string>(), "Szene vorher");
    const map = createHistory<string>();
    expect(undo("Szene", scene)?.state).toBe("Szene vorher");
    expect(undo("Karte", map)).toBeNull();
  });
});
