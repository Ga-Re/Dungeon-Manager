import { describe, expect, test } from "vitest";
import {
  apply,
  projectEvents,
  type Command,
  type DomainEvent,
  type SessionState,
  type Viewer,
} from "./index.js";
import { ctx, goblin, square, state } from "./test-data.test-data.js";

/** Applies `commands` in order and collects their events, like a session would. */
function run(start: SessionState, ...commands: Command[]) {
  const events: DomainEvent[] = [];
  const end = commands.reduce((current, command) => {
    const result = apply(current, command, ctx);
    if (!result.ok) throw new Error(result.reason);
    events.push(...result.events);
    return result.state;
  }, start);
  return { state: end, events };
}

/** Events of `commands` after `setup`, each command's projected against its own result. */
function projected(
  setup: readonly Command[],
  commands: readonly Command[],
  viewer: Viewer = { kind: "table" },
) {
  let current = run(state, ...setup).state;
  return commands.flatMap((command) => {
    const after = run(current, command);
    current = after.state;
    return projectEvents(after.events, after.state, viewer);
  });
}

// Cells are 100 px: the goblin stands at (1, 1), centre (150, 150).
const revealAll: Command = {
  type: "fog.reveal",
  levelId: "ground",
  area: square(0, 0, 400),
};
const moveGoblin = (col: number, row: number): Command => ({
  type: "token.move",
  tokenId: "token-goblin",
  to: { col, row },
});
const hideGoblin: Command = {
  type: "visibility.set",
  target: { kind: "token", tokenId: "token-goblin" },
  elementType: "token",
  visibility: "hidden",
};
const addGoblin: Command = { type: "initiative.add", combatant: goblin };
const hurtGoblin: Command = {
  type: "hp.change",
  combatantId: "goblin",
  amount: -3,
};
const showHp = (visibility: "visible" | "hidden"): Command => ({
  type: "visibility.set",
  target: { kind: "token", tokenId: "token-goblin" },
  elementType: "hp",
  visibility,
});

describe("projectEvents", () => {
  test("passes on moves of visible tokens without where they came from", () => {
    expect(projected([revealAll], [moveGoblin(2, 1)])).toEqual([
      {
        at: 1_000,
        type: "token.moved",
        tokenId: "token-goblin",
        to: { col: 2, row: 1 },
        levelId: "ground",
      },
    ]);
  });

  test("never names tokens added or removed in the players' log (T-107a)", () => {
    expect(
      projected(
        [revealAll],
        [
          {
            type: "token.add",
            token: {
              id: "token-new",
              name: "Secret Name",
              size: "medium",
              position: { col: 1, row: 1 },
              levelId: "ground",
            },
          },
          { type: "token.remove", tokenIds: ["token-goblin"] },
        ],
      ),
    ).toEqual([]);
  });

  test("drops moves of hidden tokens and of tokens ending in fog", () => {
    expect(projected([revealAll, hideGoblin], [moveGoblin(2, 1)])).toEqual([]);
    expect(projected([revealAll], [moveGoblin(8, 8)])).toEqual([]);
  });

  test("keeps a hidden token's path hidden after it is shown", () => {
    const showGoblin: Command = {
      type: "visibility.set",
      target: { kind: "token", tokenId: "token-goblin" },
      elementType: "token",
      visibility: null,
    };
    expect(
      projected(
        [revealAll, hideGoblin],
        [moveGoblin(2, 1), moveGoblin(3, 3), showGoblin],
      ),
    ).toEqual([]);
  });

  test("keeps HP hidden at the time hidden after they are shown", () => {
    expect(
      projected(
        [revealAll, addGoblin, showHp("hidden")],
        [hurtGoblin, hurtGoblin, showHp("visible")],
      ),
    ).toEqual([]);
  });

  test("drops a step through fog even when the token ends up visible", () => {
    const events = projected([revealAll], [moveGoblin(8, 8), moveGoblin(2, 2)]);
    expect(
      events.map((event) => event.type === "token.moved" && event.to),
    ).toEqual([{ col: 2, row: 2 }]);
  });

  test("shows a player every move of their own token", () => {
    const own = run(state, {
      type: "visibility.set",
      target: { kind: "token", tokenId: "token-goblin" },
      elementType: "token",
      visibility: "hidden",
    }).state;
    const owned: SessionState = {
      ...own,
      scene: {
        ...own.scene,
        tokens: own.scene.tokens.map((token) =>
          token.id === "token-goblin"
            ? { ...token, ownerPlayerId: "player-1" }
            : token,
        ),
      },
    };
    const after = run(owned, moveGoblin(8, 8));
    expect(
      projectEvents(after.events, after.state, {
        kind: "player",
        playerId: "player-1",
      }),
    ).toHaveLength(1);
    expect(projectEvents(after.events, after.state, { kind: "table" })).toEqual(
      [],
    );
  });

  test("passes on fog changes", () => {
    expect(
      projected(
        [],
        [
          revealAll,
          {
            type: "fog.hide",
            levelId: "ground",
            area: square(0, 0, 100),
            remember: false,
          },
        ],
      ).map((event) => event.type),
    ).toEqual(["fog.revealed", "fog.hidden"]);
  });

  test("passes on fog changes of a level only once it has been shown", () => {
    const revealCellar: Command = {
      type: "fog.reveal",
      levelId: "cellar",
      area: square(0, 0, 100),
    };
    expect(projected([], [revealCellar])).toEqual([]);
    expect(
      projected(
        [],
        [{ type: "level.show", levelId: "cellar" }, revealCellar],
      ).map((event) => event.type),
    ).toEqual(["level.shown", "fog.revealed"]);
  });

  test("never passes on visibility changes or removed combatants", () => {
    expect(
      projected(
        [revealAll, addGoblin],
        [
          showHp("visible"),
          { type: "initiative.remove", combatantId: "goblin" },
        ],
      ),
    ).toEqual([]);
  });

  test("passes on added combatants and turns only while they are listed", () => {
    expect(
      projected([revealAll], [addGoblin, { type: "initiative.next" }]),
    ).toEqual([
      { at: 1_000, type: "initiative.combatantAdded", combatantId: "goblin" },
      {
        at: 1_000,
        type: "initiative.turnStarted",
        round: 1,
        combatantId: "goblin",
      },
    ]);
    // The goblin's token stands in fog, so its entry is not listed.
    expect(projected([], [addGoblin, { type: "initiative.next" }])).toEqual([]);
  });

  test("shows HP as the viewer's projection does: exact, coarse or not at all", () => {
    const setup = [revealAll, addGoblin];
    // The sample campaign's default for HP is "approximate"; the goblin has 7 of 7.
    expect(projected(setup, [hurtGoblin])).toEqual([
      {
        at: 1_000,
        type: "hp.changed",
        combatantId: "goblin",
        hpState: "wounded",
      },
    ]);
    expect(projected([...setup, showHp("visible")], [hurtGoblin])).toEqual([
      {
        at: 1_000,
        type: "hp.changed",
        combatantId: "goblin",
        hp: { current: 4, temp: 0 },
      },
    ]);
    expect(projected([...setup, showHp("hidden")], [hurtGoblin])).toEqual([]);
  });

  test("drops HP changes of combatants the viewer does not see", () => {
    expect(projected([addGoblin], [hurtGoblin])).toEqual([]);
  });
});
