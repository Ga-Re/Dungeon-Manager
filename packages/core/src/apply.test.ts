import type { Polygon } from "@dungeon-manager/schema";
import { beforeAll, describe, expect, test } from "vitest";
import {
  apply,
  type ApplyResult,
  type Command,
  type SessionState,
} from "./index.js";
import {
  campaign,
  ctx,
  deepFreeze,
  goblin,
  scene,
  square,
  state,
} from "./test-data.test-data.js";

beforeAll(() => {
  deepFreeze(state);
});

function ok(result: ApplyResult) {
  if (!result.ok) throw new Error(`rejected: ${result.reason}`);
  return result;
}

function run(start: SessionState, ...commands: Command[]): SessionState {
  // Every intermediate state is frozen too, so mutation anywhere in apply fails loudly.
  return commands.reduce(
    (current, command) => ok(apply(deepFreeze(current), command, ctx)).state,
    start,
  );
}

const aria = { id: "aria", name: "Aria", initiative: 17, conditions: [] };

describe("token.move", () => {
  test("moves a token and reports where it came from", () => {
    const result = ok(
      apply(
        state,
        { type: "token.move", tokenId: "token-goblin", to: { col: 5, row: 3 } },
        ctx,
      ),
    );

    expect(result.state.scene.tokens[0]?.position).toEqual({ col: 5, row: 3 });
    expect(result.events).toEqual([
      {
        type: "token.moved",
        at: 1_000,
        tokenId: "token-goblin",
        from: { col: 1, row: 1 },
        to: { col: 5, row: 3 },
        levelId: "ground",
      },
    ]);
  });

  test("can move a token to another level", () => {
    const next = run(state, {
      type: "token.move",
      tokenId: "token-goblin",
      to: { col: 0, row: 0 },
      levelId: "cellar",
    });
    expect(next.scene.tokens[0]?.levelId).toBe("cellar");
  });

  test.each([
    [
      { type: "token.move", tokenId: "nope", to: { col: 0, row: 0 } },
      "unknownToken",
    ],
    [
      {
        type: "token.move",
        tokenId: "token-goblin",
        to: { col: 0, row: 0 },
        levelId: "roof",
      },
      "unknownLevel",
    ],
  ] satisfies [Command, string][])("rejects %j", (command, reason) => {
    expect(apply(state, command, ctx)).toEqual({ ok: false, reason });
  });

  test("needs a map", () => {
    const withoutMap = { ...state, scene: { ...scene, map: null } };
    expect(
      apply(
        withoutMap,
        { type: "token.move", tokenId: "token-goblin", to: { col: 0, row: 0 } },
        ctx,
      ),
    ).toEqual({
      ok: false,
      reason: "noMap",
    });
  });
});

describe("fog", () => {
  test("reveal merges overlapping areas into one polygon", () => {
    const next = run(
      state,
      { type: "fog.reveal", levelId: "ground", area: square(0, 0, 100) },
      { type: "fog.reveal", levelId: "ground", area: square(50, 0, 100) },
    );

    const fog = next.scene.fog.levels["ground"];
    expect(fog?.revealed).toHaveLength(1);
    expect(fog?.revealed[0]?.outer).toHaveLength(4);
    expect(fog?.revealed[0]?.holes).toEqual([]);
  });

  test("hide cuts a hole and forgets the area", () => {
    const next = run(
      state,
      { type: "fog.reveal", levelId: "ground", area: square(0, 0, 300) },
      {
        type: "fog.hide",
        levelId: "ground",
        area: square(100, 100, 50),
        remember: false,
      },
    );

    const fog = next.scene.fog.levels["ground"];
    expect(fog?.revealed[0]?.holes).toHaveLength(1);
    expect(fog?.remembered).toEqual([]);
  });

  test("hide with remember turns the previously revealed part into memory fog", () => {
    const next = run(
      state,
      { type: "fog.reveal", levelId: "ground", area: square(0, 0, 100) },
      {
        type: "fog.hide",
        levelId: "ground",
        area: square(50, 0, 100),
        remember: true,
      },
    );

    const fog = next.scene.fog.levels["ground"];
    // Only the part that was revealed (50..100) is remembered, not the whole hidden square.
    expect(fog?.remembered).toHaveLength(1);
    const xs = fog?.remembered[0]?.outer.map(([x]) => x) ?? [];
    expect(Math.min(...xs)).toBe(50);
    expect(Math.max(...xs)).toBe(100);
  });

  test("revealing a remembered area clears its memory fog", () => {
    const next = run(
      state,
      { type: "fog.reveal", levelId: "ground", area: square(0, 0, 100) },
      {
        type: "fog.hide",
        levelId: "ground",
        area: square(0, 0, 100),
        remember: true,
      },
      { type: "fog.reveal", levelId: "ground", area: square(0, 0, 100) },
    );

    expect(next.scene.fog.levels["ground"]?.remembered).toEqual([]);
    expect(next.scene.fog.levels["ground"]?.revealed).toHaveLength(1);
  });

  test("hiding everything leaves no revealed area", () => {
    const next = run(
      state,
      { type: "fog.reveal", levelId: "ground", area: square(0, 0, 100) },
      {
        type: "fog.hide",
        levelId: "ground",
        area: square(-10, -10, 200),
        remember: false,
      },
    );
    expect(next.scene.fog.levels["ground"]).toEqual({
      revealed: [],
      remembered: [],
    });
  });

  test("keeps other levels untouched and reports the change", () => {
    const result = ok(
      apply(
        state,
        { type: "fog.reveal", levelId: "cellar", area: square(0, 0, 10) },
        ctx,
      ),
    );
    expect(Object.keys(result.state.scene.fog.levels)).toEqual(["cellar"]);
    expect(result.events).toEqual([
      { type: "fog.revealed", at: 1_000, levelId: "cellar" },
    ]);
  });

  test("rejects an unknown level", () => {
    expect(
      apply(
        state,
        {
          type: "fog.hide",
          levelId: "roof",
          area: square(0, 0, 1),
          remember: false,
        },
        ctx,
      ),
    ).toEqual({
      ok: false,
      reason: "unknownLevel",
    });
  });
});

describe("visibility.set", () => {
  test("overrides a token's element visibility and clears it again", () => {
    const hidden = run(state, {
      type: "visibility.set",
      target: { kind: "token", tokenId: "token-goblin" },
      elementType: "token",
      visibility: "hidden",
    });
    expect(hidden.scene.tokens[0]?.visibility).toEqual({ token: "hidden" });

    const inherited = run(hidden, {
      type: "visibility.set",
      target: { kind: "token", tokenId: "token-goblin" },
      elementType: "token",
      visibility: null,
    });
    expect(inherited.scene.tokens[0]?.visibility).toEqual({});
  });

  test("changes and removes a campaign default", () => {
    const next = run(state, {
      type: "visibility.set",
      target: { kind: "campaign" },
      elementType: "conditions",
      visibility: "hidden",
    });
    expect(next.campaign.visibilityDefaults).toEqual({
      hp: "approximate",
      conditions: "hidden",
    });

    const cleared = run(next, {
      type: "visibility.set",
      target: { kind: "campaign" },
      elementType: "hp",
      visibility: null,
    });
    expect(cleared.campaign.visibilityDefaults).toEqual({
      conditions: "hidden",
    });
  });

  test("rejects an unknown token", () => {
    expect(
      apply(
        state,
        {
          type: "visibility.set",
          target: { kind: "token", tokenId: "x" },
          elementType: "name",
          visibility: "hidden",
        },
        ctx,
      ),
    ).toEqual({ ok: false, reason: "unknownToken" });
  });
});

describe("visibility.set on a combatant", () => {
  test("sets and clears a combatant override", () => {
    const fighting = run(state, { type: "initiative.add", combatant: goblin });
    const released = run(fighting, {
      type: "visibility.set",
      target: { kind: "combatant", combatantId: "goblin" },
      elementType: "initiative",
      visibility: "visible",
    });
    expect(released.scene.initiative?.combatants[0]?.visibility).toEqual({
      initiative: "visible",
    });
    const cleared = run(released, {
      type: "visibility.set",
      target: { kind: "combatant", combatantId: "goblin" },
      elementType: "initiative",
      visibility: null,
    });
    expect(cleared.scene.initiative?.combatants[0]?.visibility).toEqual({});
  });

  test("rejects unknown combatants and a missing tracker", () => {
    const command: Command = {
      type: "visibility.set",
      target: { kind: "combatant", combatantId: "x" },
      elementType: "hp",
      visibility: "hidden",
    };
    expect(apply(state, command, ctx)).toEqual({
      ok: false,
      reason: "noInitiative",
    });
    expect(
      apply(
        run(state, { type: "initiative.add", combatant: goblin }),
        command,
        ctx,
      ),
    ).toEqual({
      ok: false,
      reason: "unknownCombatant",
    });
  });
});

describe("initiative", () => {
  test("adds combatants in descending initiative, keeping ties in insertion order", () => {
    const tie = { ...goblin, id: "goblin-2", initiative: 12 };
    const next = run(
      state,
      { type: "initiative.add", combatant: goblin },
      { type: "initiative.add", combatant: aria },
      { type: "initiative.add", combatant: tie },
    );
    expect(next.scene.initiative?.order).toEqual([
      "aria",
      "goblin",
      "goblin-2",
    ]);
    expect(next.scene.initiative?.round).toBe(0);
  });

  test("next starts round 1 with the first combatant and wraps into the next round", () => {
    const fighting = run(
      state,
      { type: "initiative.add", combatant: goblin },
      { type: "initiative.add", combatant: aria },
    );

    const first = ok(apply(fighting, { type: "initiative.next" }, ctx));
    expect(first.state.scene.initiative).toMatchObject({
      round: 1,
      activeCombatantId: "aria",
    });
    expect(first.events).toEqual([
      {
        type: "initiative.turnStarted",
        at: 1_000,
        round: 1,
        combatantId: "aria",
      },
    ]);

    const wrapped = run(
      first.state,
      { type: "initiative.next" },
      { type: "initiative.next" },
    );
    expect(wrapped.scene.initiative).toMatchObject({
      round: 2,
      activeCombatantId: "aria",
    });
  });

  test("removing the active combatant passes the turn on", () => {
    const fighting = run(
      state,
      { type: "initiative.add", combatant: goblin },
      { type: "initiative.add", combatant: aria },
      { type: "initiative.next" },
    );
    const next = run(fighting, {
      type: "initiative.remove",
      combatantId: "aria",
    });
    expect(next.scene.initiative).toMatchObject({
      order: ["goblin"],
      activeCombatantId: "goblin",
    });

    const empty = run(next, {
      type: "initiative.remove",
      combatantId: "goblin",
    });
    expect(empty.scene.initiative).toMatchObject({
      order: [],
      combatants: [],
      activeCombatantId: null,
    });
  });

  test("removing a waiting combatant keeps the active one", () => {
    const fighting = run(
      state,
      { type: "initiative.add", combatant: goblin },
      { type: "initiative.add", combatant: aria },
      { type: "initiative.next" },
    );
    expect(
      run(fighting, { type: "initiative.remove", combatantId: "goblin" }).scene
        .initiative?.activeCombatantId,
    ).toBe("aria");
  });

  test.each([
    [
      "a duplicate combatant",
      [
        { type: "initiative.add", combatant: goblin },
        { type: "initiative.add", combatant: goblin },
      ],
      "duplicateCombatant",
    ],
    [
      "a combatant linked to an unknown token",
      [{ type: "initiative.add", combatant: { ...goblin, tokenId: "ghost" } }],
      "unknownToken",
    ],
    ["next without initiative", [{ type: "initiative.next" }], "noInitiative"],
    [
      "removing from no initiative",
      [{ type: "initiative.remove", combatantId: "goblin" }],
      "noInitiative",
    ],
    [
      "removing an unknown combatant",
      [
        { type: "initiative.add", combatant: goblin },
        { type: "initiative.remove", combatantId: "x" },
      ],
      "unknownCombatant",
    ],
  ] satisfies [string, Command[], string][])(
    "rejects %s",
    (_case, commands, reason) => {
      const before = run(state, ...commands.slice(0, -1));
      const last = commands.at(-1) as Command;
      expect(apply(before, last, ctx)).toEqual({ ok: false, reason });
    },
  );

  test("next on an empty tracker is rejected", () => {
    const empty = run(
      state,
      { type: "initiative.add", combatant: goblin },
      { type: "initiative.remove", combatantId: "goblin" },
    );
    expect(apply(empty, { type: "initiative.next" }, ctx)).toEqual({
      ok: false,
      reason: "emptyInitiative",
    });
  });
});

describe("hp", () => {
  const fighting = () =>
    run(state, { type: "initiative.add", combatant: goblin });
  const hpOf = (s: SessionState) => s.scene.initiative?.combatants[0]?.hp;

  test("damage uses temporary HP first and stops at 0", () => {
    const withTemp = run(fighting(), {
      type: "hp.setTemp",
      combatantId: "goblin",
      temp: 3,
    });
    expect(
      hpOf(
        run(withTemp, { type: "hp.change", combatantId: "goblin", amount: -5 }),
      ),
    ).toEqual({ current: 5, max: 7, temp: 0 });
    expect(
      hpOf(
        run(withTemp, { type: "hp.change", combatantId: "goblin", amount: -2 }),
      ),
    ).toEqual({ current: 7, max: 7, temp: 1 });
    expect(
      hpOf(
        run(withTemp, {
          type: "hp.change",
          combatantId: "goblin",
          amount: -50,
        }),
      )?.current,
    ).toBe(0);
  });

  test("healing stops at maximum HP and reports the result", () => {
    const hurt = run(fighting(), {
      type: "hp.change",
      combatantId: "goblin",
      amount: -6,
    });
    const healed = ok(
      apply(
        hurt,
        { type: "hp.change", combatantId: "goblin", amount: 10 },
        ctx,
      ),
    );
    expect(hpOf(healed.state)).toEqual({ current: 7, max: 7, temp: 0 });
    expect(healed.events).toEqual([
      {
        type: "hp.changed",
        at: 1_000,
        combatantId: "goblin",
        current: 7,
        temp: 0,
      },
    ]);
  });

  test.each([
    [
      { type: "hp.change", combatantId: "goblin", amount: 1.5 },
      "invalidAmount",
    ],
    [{ type: "hp.change", combatantId: "goblin", amount: 0 }, "invalidAmount"],
    [{ type: "hp.setTemp", combatantId: "goblin", temp: -1 }, "invalidAmount"],
    [{ type: "hp.change", combatantId: "x", amount: -1 }, "unknownCombatant"],
  ] satisfies [Command, string][])("rejects %j", (command, reason) => {
    expect(apply(fighting(), command, ctx)).toEqual({ ok: false, reason });
  });

  test("rejects HP changes for combatants whose HP is not tracked", () => {
    const withAria = run(state, { type: "initiative.add", combatant: aria });
    expect(
      apply(
        withAria,
        { type: "hp.change", combatantId: "aria", amount: -1 },
        ctx,
      ),
    ).toEqual({ ok: false, reason: "hpNotTracked" });
  });

  test("rejects HP changes without initiative", () => {
    expect(
      apply(
        state,
        { type: "hp.change", combatantId: "goblin", amount: -1 },
        ctx,
      ),
    ).toEqual({ ok: false, reason: "noInitiative" });
  });
});

test("apply never mutates its input (state is deep-frozen in these tests)", () => {
  expect(Object.isFrozen(state.scene.tokens[0])).toBe(true);
  expect(campaign.visibilityDefaults).toEqual({ hp: "approximate" });
});

describe("invalid input never corrupts the scene", () => {
  const ring = (points: [number, number][]) => ({ outer: points, holes: [] });
  test.each([
    [
      "NaN coordinates",
      ring([
        [0, 0],
        [Number.NaN, 0],
        [0, 1],
      ]),
    ],
    [
      "infinite coordinates",
      ring([
        [0, 0],
        [Number.POSITIVE_INFINITY, 0],
        [0, 1],
      ]),
    ],
    ["an empty ring", ring([])],
    [
      "a hole with two points",
      {
        outer: square(0, 0, 10).outer,
        holes: [
          [
            [1, 1],
            [2, 2],
          ],
        ],
      },
    ],
  ] satisfies [string, Polygon][])(
    "rejects a fog area with %s",
    (_case, area) => {
      expect(
        apply(state, { type: "fog.reveal", levelId: "ground", area }, ctx),
      ).toEqual({ ok: false, reason: "invalidArea" });
      expect(
        apply(
          state,
          { type: "fog.hide", levelId: "ground", area, remember: true },
          ctx,
        ),
      ).toEqual({
        ok: false,
        reason: "invalidArea",
      });
    },
  );

  test.each([
    { col: -1, row: 0 },
    { col: 1.5, row: 0 },
    { col: Number.NaN, row: 0 },
  ])("rejects moving a token to %j", (to) => {
    expect(
      apply(state, { type: "token.move", tokenId: "token-goblin", to }, ctx),
    ).toEqual({ ok: false, reason: "invalidCell" });
  });
});

describe("initiative edge cases", () => {
  const twoFighters = () =>
    run(
      state,
      { type: "initiative.add", combatant: goblin },
      { type: "initiative.add", combatant: aria },
    );

  test("removing the active combatant at the end of the order starts the next round", () => {
    const goblinsTurn = run(
      twoFighters(),
      { type: "initiative.next" },
      { type: "initiative.next" },
    );
    expect(goblinsTurn.scene.initiative).toMatchObject({
      round: 1,
      activeCombatantId: "goblin",
    });

    const result = ok(
      apply(
        goblinsTurn,
        { type: "initiative.remove", combatantId: "goblin" },
        ctx,
      ),
    );
    expect(result.state.scene.initiative).toMatchObject({
      round: 2,
      activeCombatantId: "aria",
    });
    expect(result.events).toEqual([
      { type: "initiative.combatantRemoved", at: 1_000, combatantId: "goblin" },
      {
        type: "initiative.turnStarted",
        at: 1_000,
        round: 2,
        combatantId: "aria",
      },
    ]);
  });

  test("removing everyone ends combat, so the next fight starts at round 1", () => {
    const ended = run(
      twoFighters(),
      { type: "initiative.next" },
      { type: "initiative.next" },
      { type: "initiative.next" },
      { type: "initiative.remove", combatantId: "aria" },
      { type: "initiative.remove", combatantId: "goblin" },
    );
    expect(ended.scene.initiative).toMatchObject({
      round: 0,
      activeCombatantId: null,
      order: [],
    });

    const restarted = run(
      ended,
      { type: "initiative.add", combatant: goblin },
      { type: "initiative.next" },
    );
    expect(restarted.scene.initiative?.round).toBe(1);
  });

  test("adding a combatant keeps a hand-made order intact", () => {
    // Order changed by hand (e.g. the goblin delayed its turn before Aria): no re-sorting on add.
    const manual: SessionState = {
      ...state,
      scene: {
        ...scene,
        initiative: {
          round: 1,
          activeCombatantId: "goblin",
          order: ["goblin", "aria"],
          combatants: [goblin, aria],
        },
      },
    };
    const orc = { id: "orc", name: "Ork", initiative: 20, conditions: [] };
    const next = run(manual, { type: "initiative.add", combatant: orc });
    expect(next.scene.initiative?.order).toEqual(["orc", "goblin", "aria"]);
  });

  test("healing never lowers HP above the maximum", () => {
    const boosted = { ...goblin, hp: { current: 9, max: 7, temp: 0 } };
    const next = run(
      state,
      { type: "initiative.add", combatant: boosted },
      { type: "hp.change", combatantId: "goblin", amount: 3 },
    );
    expect(next.scene.initiative?.combatants[0]?.hp?.current).toBe(9);
  });
});

describe("level.show", () => {
  test("shows a level on the TV and keeps the levels shown before released", () => {
    const result = ok(
      apply(state, { type: "level.show", levelId: "cellar" }, ctx),
    );
    // The ground floor was on the TV before (the first level, without `table`): released too.
    expect(result.state.scene.table).toEqual({
      levelId: "cellar",
      shownLevelIds: ["ground", "cellar"],
    });
    expect(result.events).toEqual([
      { at: 1_000, type: "level.shown", levelId: "cellar" },
    ]);
    const back = run(
      result.state,
      { type: "level.show", levelId: "ground" },
      { type: "level.show", levelId: "cellar" },
    );
    expect(back.scene.table).toEqual({
      levelId: "cellar",
      shownLevelIds: ["ground", "cellar"],
    });
  });

  test("showing the level already on the TV changes nothing, also without `table`", () => {
    const first = apply(state, { type: "level.show", levelId: "ground" }, ctx);
    expect(first).toEqual({ ok: true, state, events: [] });
    expect(ok(first).state).toBe(state);
  });

  test("rejects unknown levels and scenes without a map", () => {
    expect(apply(state, { type: "level.show", levelId: "roof" }, ctx)).toEqual({
      ok: false,
      reason: "unknownLevel",
    });
    expect(
      apply(
        { ...state, scene: { ...scene, map: null } },
        { type: "level.show", levelId: "ground" },
        ctx,
      ),
    ).toEqual({ ok: false, reason: "noMap" });
  });
});
