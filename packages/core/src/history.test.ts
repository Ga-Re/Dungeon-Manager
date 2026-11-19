import { describe, expect, test } from "vitest";
import {
  createHistory,
  execute,
  HISTORY_LIMIT,
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
});
