import type { Combatant } from "@dungeon-manager/schema";
import { describe, expect, test } from "vitest";
import {
  apply,
  approximateHp,
  projectForViewer,
  tokenVisibility,
  type Command,
  type SessionState,
} from "./index.js";
import { ctx, goblin, square, state } from "./test-data.test-data.js";

function run(start: SessionState, ...commands: Command[]): SessionState {
  return commands.reduce((current, command) => {
    const result = apply(current, command, ctx);
    if (!result.ok) throw new Error(result.reason);
    return result.state;
  }, start);
}

const table = { kind: "table" } as const;
// Cells are 100 px: the goblin's centre is (150, 150), Aria's (250, 250).
const revealGoblin: Command = {
  type: "fog.reveal",
  levelId: "ground",
  area: square(100, 100, 100),
};
const revealAll: Command = {
  type: "fog.reveal",
  levelId: "ground",
  area: square(0, 0, 1000),
};
const ids = (
  s: SessionState,
  viewer = table as Parameters<typeof projectForViewer>[1],
) => projectForViewer(s, viewer).tokens.map((token) => token.id);

describe("projectForViewer", () => {
  test("shows only tokens in revealed fog", () => {
    expect(ids(state)).toEqual([]);
    expect(ids(run(state, revealGoblin))).toEqual(["token-goblin"]);
  });

  test("hides tokens in memory fog (current movement stays hidden)", () => {
    const remembered = run(state, revealAll, {
      type: "fog.hide",
      levelId: "ground",
      area: square(0, 0, 1000),
      remember: true,
    });
    expect(ids(remembered)).toEqual([]);
  });

  test("hides tokens set to hidden, even in revealed areas", () => {
    const hidden = run(state, revealAll, {
      type: "visibility.set",
      target: { kind: "token", tokenId: "token-goblin" },
      elementType: "token",
      visibility: "hidden",
    });
    expect(ids(hidden)).toEqual(["token-aria"]);
  });

  test("a player always sees their own token, even under fog", () => {
    const owned: SessionState = {
      ...state,
      scene: {
        ...state.scene,
        tokens: state.scene.tokens.map((t) =>
          t.id === "token-aria" ? { ...t, ownerPlayerId: "player-1" } : t,
        ),
      },
    };
    expect(ids(owned, { kind: "player", playerId: "player-1" })).toEqual([
      "token-aria",
    ]);
    expect(ids(owned, table)).toEqual([]);
  });

  test("a large token counts as visible by its centre", () => {
    const big = run(
      {
        ...state,
        scene: {
          ...state.scene,
          tokens: state.scene.tokens.map((t) =>
            t.id === "token-goblin" ? { ...t, size: "large" as const } : t,
          ),
        },
      },
      { type: "fog.reveal", levelId: "ground", area: square(190, 190, 20) },
    );
    expect(ids(big)).toEqual(["token-goblin"]);
  });

  test("omits names that are not visible and never copies unknown fields", () => {
    const secretive = run(state, revealAll, {
      type: "visibility.set",
      target: { kind: "token", tokenId: "token-goblin" },
      elementType: "name",
      visibility: "hidden",
    });
    const withExtra: SessionState = {
      ...secretive,
      scene: {
        ...secretive.scene,
        tokens: secretive.scene.tokens.map((t) => ({
          ...t,
          dmNote: "trap below",
        })),
      },
    };
    const projected = projectForViewer(withExtra, table);
    expect(projected.tokens[0]).toEqual({
      id: "token-goblin",
      size: "small",
      position: { col: 1, row: 1 },
      levelId: "ground",
    });
    expect(JSON.stringify(projected)).not.toContain("trap below");
  });

  test("never sends a token's creature reference (T-180a): its values stay on the host", () => {
    const revealedState = run(state, revealAll);
    const withCreature: SessionState = {
      ...revealedState,
      scene: {
        ...revealedState.scene,
        tokens: revealedState.scene.tokens.map((t) => ({
          ...t,
          creature: { source: "library" as const, id: "goblin-boss" },
          shape: { source: "library" as const, id: "wolf" },
        })),
      },
    };
    const projected = JSON.stringify(projectForViewer(withCreature, table));
    expect(projected).not.toContain("goblin-boss");
    expect(projected).not.toContain("wolf");
  });

  test("is empty without a map", () => {
    expect(
      ids({ ...state, scene: { ...state.scene, map: null }, map: null }),
    ).toEqual([]);
  });

  test("takes the map from the resolved map, not from the scene file (T-134)", () => {
    expect(projectForViewer({ ...state, map: null }, table).map).toBeNull();
  });

  test("an archived level shows like any other once released, without its flag", () => {
    const map = state.map;
    if (!map) throw new Error("the sample scene has a map");
    const archived: SessionState = {
      ...state,
      scene: {
        ...state.scene,
        table: { levelId: "ground", shownLevelIds: ["ground", "cellar"] },
      },
      map: {
        ...map,
        levels: map.levels.map((level) => ({ ...level, archived: true })),
      },
    };
    expect(projectForViewer(archived, table).map?.levels).toEqual([
      { id: "ground", name: "Erdgeschoss" },
      { id: "cellar", name: "Keller" },
    ]);
    // Not shown yet: an archived level stays out like any other.
    expect(
      projectForViewer({ ...archived, scene: state.scene }, table).map?.levels,
    ).toEqual([{ id: "ground", name: "Erdgeschoss" }]);
  });

  describe("initiative", () => {
    const hurt: Combatant = {
      ...goblin,
      hp: { current: 3, max: 7, temp: 0 },
      conditions: [{ type: "poisoned", remainingRounds: 2 }],
    };
    const pc: Combatant = {
      id: "pc",
      name: "Aria",
      initiative: 20,
      conditions: [],
    };
    const fight = run(
      state,
      revealAll,
      { type: "initiative.add", combatant: hurt },
      { type: "initiative.add", combatant: pc },
      // Without a token, the PC stays off the tracker until the DM releases it.
      {
        type: "visibility.set",
        target: { kind: "combatant", combatantId: "pc" },
        elementType: "initiative",
        visibility: "visible",
      },
      { type: "initiative.next" },
    );

    test("a combatant without a token is hidden until the DM releases it", () => {
      const ambush = run(state, revealAll, {
        type: "initiative.add",
        combatant: { ...pc, id: "lurker", name: "Lauerer" },
      });
      expect(projectForViewer(ambush, table).initiative?.combatants).toEqual(
        [],
      );
      expect(JSON.stringify(projectForViewer(ambush, table))).not.toContain(
        "Lauerer",
      );

      const released = run(ambush, {
        type: "visibility.set",
        target: { kind: "combatant", combatantId: "lurker" },
        elementType: "initiative",
        visibility: "visible",
      });
      expect(
        projectForViewer(released, table).initiative?.combatants.map(
          (c) => c.id,
        ),
      ).toEqual(["lurker"]);
    });

    test("a combatant's own override wins over its token's and the campaign's", () => {
      const secretHp = run(fight, {
        type: "visibility.set",
        target: { kind: "combatant", combatantId: "goblin" },
        elementType: "hp",
        visibility: "hidden",
      });
      const row = projectForViewer(secretHp, table).initiative?.combatants.find(
        (c) => c.id === "goblin",
      );
      expect(row?.hp).toBeUndefined();
      expect(row?.hpState).toBeUndefined();
    });

    test("approximate HP become a coarse state; exact numbers stay on the host", () => {
      const goblinRow = projectForViewer(
        fight,
        table,
      ).initiative?.combatants.find((c) => c.id === "goblin");
      expect(goblinRow).toEqual({
        id: "goblin",
        name: "Goblin",
        tokenId: "token-goblin",
        hpState: "badlyWounded",
        conditions: [{ type: "poisoned", remainingRounds: 2 }],
      });
    });

    test("visible HP are exact, hidden HP and conditions are absent", () => {
      const open = run(fight, {
        type: "visibility.set",
        target: { kind: "campaign" },
        elementType: "hp",
        visibility: "visible",
      });
      expect(
        projectForViewer(open, table).initiative?.combatants[1]?.hp,
      ).toEqual({ current: 3, max: 7, temp: 0 });

      const closed = run(
        fight,
        {
          type: "visibility.set",
          target: { kind: "campaign" },
          elementType: "hp",
          visibility: "hidden",
        },
        {
          type: "visibility.set",
          target: { kind: "campaign" },
          elementType: "conditions",
          visibility: "hidden",
        },
      );
      expect(projectForViewer(closed, table).initiative?.combatants[1]).toEqual(
        { id: "goblin", name: "Goblin", tokenId: "token-goblin" },
      );
    });

    test("an exhaustion level never reaches a viewer (T-244, DM decision)", () => {
      const tired = run(
        fight,
        {
          type: "condition.add",
          combatantId: "goblin",
          condition: { type: "exhaustion", level: 3, remainingRounds: 2 },
        },
        {
          type: "visibility.set",
          target: { kind: "campaign" },
          elementType: "conditions",
          visibility: "visible",
        },
      );
      expect(
        projectForViewer(tired, table).initiative?.combatants[1]?.conditions,
      ).toContainEqual({ type: "exhaustion", remainingRounds: 2 });
      const conditions =
        projectForViewer(tired, table).initiative?.combatants[1]?.conditions ??
        [];
      expect(conditions.every((each) => !("level" in each))).toBe(true);
    });

    test("approximate conditions show the type but not the duration", () => {
      const vague = run(fight, {
        type: "visibility.set",
        target: { kind: "campaign" },
        elementType: "conditions",
        visibility: "approximate",
      });
      expect(
        projectForViewer(vague, table).initiative?.combatants[1]?.conditions,
      ).toEqual([{ type: "poisoned" }]);
    });

    test("combatants of invisible tokens are left out, including as the active one", () => {
      const goblinTurn = run(
        fight,
        { type: "initiative.next" },
        {
          type: "fog.hide",
          levelId: "ground",
          area: square(0, 0, 1000),
          remember: false,
        },
      );
      const initiative = projectForViewer(goblinTurn, table).initiative;
      expect(initiative?.combatants.map((c) => c.id)).toEqual(["pc"]);
      expect(initiative?.activeCombatantId).toBeNull();
    });

    test("a hidden tracker shows only entries the DM released individually", () => {
      const hidden = run(fight, {
        type: "visibility.set",
        target: { kind: "campaign" },
        elementType: "initiative",
        visibility: "hidden",
      });
      // The PC was released on the combatant itself, which wins over the campaign default.
      expect(
        projectForViewer(hidden, table).initiative?.combatants.map((c) => c.id),
      ).toEqual(["pc"]);

      const nothingReleased = run(hidden, {
        type: "visibility.set",
        target: { kind: "combatant", combatantId: "pc" },
        elementType: "initiative",
        visibility: null,
      });
      expect(
        projectForViewer(nothingReleased, table).initiative,
      ).toBeUndefined();
    });

    test("a player sees exact HP and the name of their own combatant", () => {
      const owned = {
        ...fight,
        scene: {
          ...fight.scene,
          tokens: fight.scene.tokens.map((t) =>
            t.id === "token-goblin"
              ? {
                  ...t,
                  ownerPlayerId: "player-1",
                  visibility: { name: "hidden" as const },
                }
              : t,
          ),
        },
      };
      const row = projectForViewer(owned, {
        kind: "player",
        playerId: "player-1",
      }).initiative?.combatants.find((c) => c.id === "goblin");
      expect(row).toMatchObject({
        name: "Goblin",
        hp: { current: 3, max: 7, temp: 0 },
      });
    });
  });
});

test.each([
  [7, 7, "unhurt"],
  [9, 7, "unhurt"],
  [6, 7, "wounded"],
  [4, 8, "badlyWounded"],
  [0, 7, "down"],
  [-3, 7, "down"],
] as const)("approximateHp(%i, %i) is %s", (current, max, expected) => {
  expect(approximateHp(current, max)).toBe(expected);
});

describe("tokenVisibility (T-107b)", () => {
  test("a token's own setting wins over the campaign default, else visible", () => {
    expect(tokenVisibility({}, {})).toBe("visible");
    expect(tokenVisibility({ token: "hidden" }, {})).toBe("hidden");
    expect(
      tokenVisibility(
        { token: "hidden" },
        { visibility: { token: "visible" } },
      ),
    ).toBe("visible");
    expect(tokenVisibility({}, { visibility: { token: "hidden" } })).toBe(
      "hidden",
    );
  });
});
