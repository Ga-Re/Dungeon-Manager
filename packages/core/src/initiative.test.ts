import type { Combatant } from "@dungeon-manager/schema";
import { describe, expect, test } from "vitest";
import {
  apply,
  createHistory,
  execute,
  goesBefore,
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
    expect(
      apply(state, { type: "initiative.addMany", combatants: [] }, ctx),
    ).toEqual({ ok: false, reason: "unknownCombatant" });
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
});
