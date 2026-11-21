import type { Combatant } from "@dungeon-manager/schema";
import { describe, expect, test } from "vitest";
import {
  apply,
  createHistory,
  execute,
  goesBefore,
  projectEvents,
  rollInitiative,
  undo,
  type ApplyResult,
  type Command,
  type SessionState,
} from "./index.js";
import { ctx, state } from "./test-data.test-data.js";

// The initiative tracker (T-111, DM decisions 2026-11-21).

const bounds = { firstCol: 0, firstRow: 0, cols: 10, rows: 8 };
const fighter = (
  id: string,
  initiative: number,
  extra: Partial<Combatant> = {},
): Combatant => ({ id, name: id, initiative, conditions: [], ...extra });

function ok(result: ApplyResult) {
  if (!result.ok) throw new Error(`rejected: ${result.reason}`);
  return result;
}
function run(start: SessionState, ...commands: Command[]): SessionState {
  return commands.reduce(
    (current, command) => ok(apply(current, command, ctx)).state,
    start,
  );
}
const order = (current: SessionState) => current.scene.initiative?.order;
const active = (current: SessionState) =>
  current.scene.initiative?.activeCombatantId;
const combatant = (current: SessionState, id: string) =>
  current.scene.initiative?.combatants.find((each) => each.id === id);

describe("rolling and ranking", () => {
  test("a d20 plus the bonus, from the injected random source", () => {
    expect(rollInitiative(2, () => 0)).toBe(3);
    expect(rollInitiative(2, () => 0.999)).toBe(22);
    expect(rollInitiative(-1, () => 0.5)).toBe(10);
  });

  test("higher initiative first; on a tie the higher bonus, then a player's character", () => {
    expect(goesBefore(fighter("a", 15), fighter("b", 12))).toBe(true);
    expect(
      goesBefore(
        fighter("a", 12, { initiativeBonus: 3 }),
        fighter("b", 12, { initiativeBonus: 1 }),
      ),
    ).toBe(true);
    expect(
      goesBefore(fighter("pc", 12, { playerId: "p1" }), fighter("goblin", 12)),
    ).toBe(true);
    expect(goesBefore(fighter("a", 12), fighter("b", 12))).toBe(false);
  });
});

describe("initiative commands", () => {
  const four = [
    fighter("goblin", 12, { initiativeBonus: 2 }),
    fighter("aria", 12, { initiativeBonus: 2, playerId: "p1" }),
    fighter("ogre", 8),
    fighter("lair", 20),
  ];

  test("addMany sorts in as one step: initiative, bonus, players first", () => {
    const added = ok(
      apply(state, { type: "initiative.addMany", combatants: four }, ctx),
    );
    expect(order(added.state)).toEqual(["lair", "aria", "goblin", "ogre"]);
    expect(added.events.map((event) => event.type)).toEqual([
      "initiative.combatantAdded",
      "initiative.combatantAdded",
      "initiative.combatantAdded",
      "initiative.combatantAdded",
    ]);
    const none = ok(
      apply(state, { type: "initiative.addMany", combatants: [] }, ctx),
    );
    expect(none.state).toBe(state);
  });

  test("start begins combat and the first turn in round 1, as one step", () => {
    const start = run(state, { type: "initiative.addMany", combatants: four });
    const started = execute(
      start,
      createHistory(),
      { type: "initiative.start", bounds },
      ctx,
    );
    if (!started.ok) throw new Error("rejected");
    expect(started.state.scene.combat).toBe(true);
    expect(active(started.state)).toBe("lair");
    expect(started.state.scene.initiative?.round).toBe(1);
    expect(undo(started.state, started.history)?.state).toEqual(start);
    expect(apply(state, { type: "initiative.start", bounds }, ctx)).toEqual({
      ok: false,
      reason: "emptyInitiative",
    });
  });

  test("end clears the initiative and ends combat, as one step", () => {
    const fighting = run(
      state,
      { type: "initiative.addMany", combatants: four },
      { type: "initiative.start", bounds },
    );
    const ended = run(fighting, { type: "initiative.end" });
    expect(ended.scene.initiative).toBeNull();
    expect(ended.scene.combat).toBeUndefined();
  });

  test("delay skips the combatant until it acts now, before the one whose turn it is", () => {
    let current = run(
      state,
      { type: "initiative.addMany", combatants: four },
      { type: "initiative.start", bounds },
    );
    // lair delays: aria's turn.
    current = run(current, { type: "initiative.delay", combatantId: "lair" });
    expect(active(current)).toBe("aria");
    expect(combatant(current, "lair")?.delayed).toBe(true);
    // Skipped while delayed, also across the round's end.
    current = run(
      current,
      { type: "initiative.next" },
      { type: "initiative.next" },
      { type: "initiative.next" },
    );
    expect(active(current)).toBe("aria");
    expect(current.scene.initiative?.round).toBe(2);
    // lair acts now, before goblin's turn, and keeps that place.
    current = run(current, { type: "initiative.next" });
    expect(active(current)).toBe("goblin");
    current = run(current, { type: "initiative.actNow", combatantId: "lair" });
    expect(active(current)).toBe("lair");
    expect(order(current)).toEqual(["aria", "lair", "goblin", "ogre"]);
    expect(combatant(current, "lair")?.delayed).toBeUndefined();
    current = run(current, { type: "initiative.next" });
    expect(active(current)).toBe("goblin");
  });

  test("only the active one delays; only a delayed one acts now", () => {
    const fighting = run(
      state,
      { type: "initiative.addMany", combatants: four },
      { type: "initiative.start", bounds },
    );
    expect(
      apply(fighting, { type: "initiative.delay", combatantId: "ogre" }, ctx),
    ).toEqual({ ok: false, reason: "notActive" });
    expect(
      apply(fighting, { type: "initiative.actNow", combatantId: "ogre" }, ctx),
    ).toEqual({ ok: false, reason: "notDelayed" });
  });

  test("ready marks a held action until the combatant's next turn", () => {
    let current = run(
      state,
      { type: "initiative.addMany", combatants: four },
      { type: "initiative.start", bounds },
      { type: "initiative.ready", combatantId: "ogre", ready: true },
    );
    expect(combatant(current, "ogre")?.ready).toBe(true);
    current = run(
      current,
      { type: "initiative.next" },
      { type: "initiative.next" },
    );
    expect(combatant(current, "ogre")?.ready).toBe(true);
    current = run(current, { type: "initiative.next" });
    expect(active(current)).toBe("ogre");
    expect(combatant(current, "ogre")?.ready).toBeUndefined();
    const cleared = run(
      current,
      { type: "initiative.ready", combatantId: "aria", ready: true },
      { type: "initiative.ready", combatantId: "aria", ready: false },
    );
    expect(combatant(cleared, "aria")?.ready).toBeUndefined();
  });

  test("move reorders by hand; adding later keeps that order", () => {
    let current = run(
      state,
      { type: "initiative.addMany", combatants: four },
      { type: "initiative.move", combatantId: "ogre", index: 0 },
    );
    expect(order(current)).toEqual(["ogre", "lair", "aria", "goblin"]);
    current = run(current, {
      type: "initiative.add",
      combatant: fighter("rat", 10),
    });
    expect(order(current)).toEqual(["ogre", "lair", "aria", "goblin", "rat"]);
    // Out of range lands at the end; the same place changes nothing.
    const same = run(current, {
      type: "initiative.move",
      combatantId: "rat",
      index: 99,
    });
    expect(same).toBe(current);
    expect(
      apply(
        current,
        { type: "initiative.move", combatantId: "nobody", index: 0 },
        ctx,
      ),
    ).toEqual({ ok: false, reason: "unknownCombatant" });
  });

  test("removing the active one passes the turn like next turn: delayed skipped, ready ended", () => {
    let current = run(
      state,
      { type: "initiative.addMany", combatants: four },
      { type: "initiative.start", bounds },
      { type: "initiative.delay", combatantId: "lair" },
      { type: "initiative.ready", combatantId: "goblin", ready: true },
    );
    // aria's turn; removing her passes to goblin (ready ends), skipping nobody.
    current = run(current, { type: "initiative.remove", combatantId: "aria" });
    expect(active(current)).toBe("goblin");
    expect(combatant(current, "goblin")?.ready).toBeUndefined();
    // ogre's turn; removing him wraps past the delayed lair to goblin, next round.
    current = run(
      current,
      { type: "initiative.next" },
      { type: "initiative.remove", combatantId: "ogre" },
    );
    expect(active(current)).toBe("goblin");
    expect(current.scene.initiative?.round).toBe(2);
  });

  test("when all have delayed, the next one acts and is no longer delayed", () => {
    const two = [fighter("a", 15), fighter("b", 10)];
    let current = run(
      state,
      { type: "initiative.addMany", combatants: two },
      { type: "initiative.start", bounds },
      { type: "initiative.delay", combatantId: "a" },
    );
    expect(active(current)).toBe("b");
    current = run(current, { type: "initiative.delay", combatantId: "b" });
    expect(active(current)).toBe("a");
    expect(combatant(current, "a")?.delayed).toBeUndefined();
    // The active one cannot "act now"; nor can anyone before the first turn.
    expect(
      apply(current, { type: "initiative.actNow", combatantId: "a" }, ctx),
    ).toEqual({ ok: false, reason: "notDelayed" });
    const waiting = run(state, {
      type: "initiative.add",
      combatant: fighter("x", 5, { delayed: true, ready: true }),
    });
    // Markers do not come in with a new combatant.
    expect(combatant(waiting, "x")?.delayed).toBeUndefined();
    expect(combatant(waiting, "x")?.ready).toBeUndefined();
  });

  test("start on a running initiative only snaps; end without one changes nothing; end is undone as one step", () => {
    const fighting = run(
      state,
      { type: "initiative.addMany", combatants: four },
      { type: "initiative.start", bounds },
      { type: "initiative.next" },
    );
    const again = run(fighting, { type: "initiative.start", bounds });
    expect(again.scene.initiative?.round).toBe(1);
    expect(active(again)).toBe("aria");
    const nothing = ok(apply(state, { type: "initiative.end" }, ctx));
    expect(nothing.state).toBe(state);
    expect(nothing.events).toEqual([]);
    const ended = execute(
      fighting,
      createHistory(),
      { type: "initiative.end" },
      ctx,
    );
    if (!ended.ok) throw new Error("rejected");
    expect(undo(ended.state, ended.history)?.state).toEqual(fighting);
  });

  test("commands on no initiative are refused; a move to no number changes nothing", () => {
    for (const command of [
      { type: "initiative.delay", combatantId: "a" },
      { type: "initiative.actNow", combatantId: "a" },
      { type: "initiative.ready", combatantId: "a", ready: true },
      { type: "initiative.move", combatantId: "a", index: 0 },
    ] as const)
      expect(apply(state, command, ctx)).toEqual({
        ok: false,
        reason: "noInitiative",
      });
    const added = run(state, { type: "initiative.addMany", combatants: four });
    expect(
      run(added, {
        type: "initiative.move",
        combatantId: "ogre",
        index: Number.NaN,
      }),
    ).toBe(added);
  });

  test("a hidden combatant's turn from acting now is not told to the players", () => {
    // Without a token and without released initiative visibility, a combatant stays hidden.
    const fighting = run(
      state,
      { type: "initiative.addMany", combatants: four },
      { type: "initiative.start", bounds },
      { type: "initiative.delay", combatantId: "lair" },
    );
    const acted = ok(
      apply(fighting, { type: "initiative.actNow", combatantId: "lair" }, ctx),
    );
    expect(projectEvents(acted.events, acted.state, { kind: "table" })).toEqual(
      [],
    );
  });

  test("setValue places a combatant anew by its new initiative; turn and markers stay", () => {
    const fighting = run(
      state,
      { type: "initiative.addMany", combatants: four },
      { type: "initiative.start", bounds },
      { type: "initiative.ready", combatantId: "ogre", ready: true },
    );
    const raised = run(fighting, {
      type: "initiative.setValue",
      combatantId: "ogre",
      initiative: 13,
    });
    expect(order(raised)).toEqual(["lair", "ogre", "aria", "goblin"]);
    expect(combatant(raised, "ogre")).toMatchObject({
      initiative: 13,
      ready: true,
    });
    expect(active(raised)).toBe("lair");
    expect(
      run(raised, {
        type: "initiative.setValue",
        combatantId: "ogre",
        initiative: 13,
      }),
    ).toBe(raised);
    expect(
      apply(
        raised,
        {
          type: "initiative.setValue",
          combatantId: "ogre",
          initiative: Number.NaN,
        },
        ctx,
      ),
    ).toEqual({ ok: false, reason: "invalidAmount" });
  });

  test("setValue keeps a combatant whose token was removed, the active turn and delay", () => {
    const withToken = fighter("guard", 9, { tokenId: "token-goblin" });
    let current = run(
      state,
      { type: "initiative.addMany", combatants: [...four, withToken] },
      { type: "initiative.start", bounds },
      { type: "token.remove", tokenIds: ["token-goblin"] },
    );
    current = run(current, {
      type: "initiative.setValue",
      combatantId: "guard",
      initiative: 30,
    });
    expect(order(current)?.[0]).toBe("guard");
    // The active one moves, the turn stays on it.
    current = run(current, {
      type: "initiative.setValue",
      combatantId: "lair",
      initiative: 1,
    });
    expect(active(current)).toBe("lair");
    expect(order(current)?.at(-1)).toBe("lair");
    // A delayed one stays delayed.
    current = run(
      current,
      { type: "initiative.delay", combatantId: "lair" },
      { type: "initiative.setValue", combatantId: "lair", initiative: 5 },
    );
    expect(combatant(current, "lair")?.delayed).toBe(true);
    expect(
      apply(
        current,
        { type: "initiative.setValue", combatantId: "nobody", initiative: 3 },
        ctx,
      ),
    ).toEqual({ ok: false, reason: "unknownCombatant" });
    expect(
      apply(
        state,
        { type: "initiative.setValue", combatantId: "lair", initiative: 3 },
        ctx,
      ),
    ).toEqual({ ok: false, reason: "noInitiative" });
  });
});
