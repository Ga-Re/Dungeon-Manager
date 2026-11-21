import { describe, expect, test } from "vitest";
import {
  canApply,
  type Actor,
  type Command,
  type SessionState,
} from "./index.js";
import { goblin, scene, square, state } from "./test-data.test-data.js";

const owned: SessionState = {
  ...state,
  scene: {
    ...scene,
    tokens: scene.tokens.map((token) =>
      token.id === "token-aria"
        ? { ...token, ownerPlayerId: "player-1" }
        : token,
    ),
  },
};

const everyCommand: Command[] = [
  { type: "token.move", tokenId: "token-aria", to: { col: 3, row: 3 } },
  {
    type: "token.add",
    token: {
      id: "token-new",
      name: "Neu",
      size: "medium",
      position: { col: 3, row: 3 },
      levelId: "ground",
    },
  },
  { type: "token.remove", tokenIds: ["token-aria"] },
  {
    type: "token.moveMany",
    moves: [{ tokenId: "token-aria", to: { col: 4, row: 4 } }],
  },
  { type: "fog.reveal", levelId: "ground", area: square(0, 0, 10) },
  {
    type: "fog.hide",
    levelId: "ground",
    area: square(0, 0, 10),
    remember: false,
  },
  {
    type: "visibility.set",
    target: { kind: "campaign" },
    elementType: "hp",
    visibility: "hidden",
  },
  {
    type: "visibility.setTokens",
    tokenIds: ["token-aria"],
    elementType: "token",
    visibility: "hidden",
  },
  { type: "initiative.add", combatant: goblin },
  { type: "initiative.remove", combatantId: "goblin" },
  { type: "initiative.next" },
  { type: "hp.change", combatantId: "goblin", amount: -1 },
  { type: "hp.setTemp", combatantId: "goblin", temp: 2 },
  { type: "level.show", levelId: "cellar" },
  {
    type: "combat.start",
    bounds: { firstCol: 0, firstRow: 0, cols: 10, rows: 10 },
  },
  { type: "combat.end" },
  { type: "scene.setGridMode", gridMode: "free" },
  { type: "initiative.addMany", combatants: [goblin] },
  {
    type: "initiative.start",
    bounds: { firstCol: 0, firstRow: 0, cols: 10, rows: 10 },
  },
  { type: "initiative.end" },
  { type: "initiative.delay", combatantId: "goblin" },
  { type: "initiative.actNow", combatantId: "goblin" },
  { type: "initiative.ready", combatantId: "goblin", ready: true },
  { type: "initiative.move", combatantId: "goblin", index: 0 },
  { type: "initiative.setValue", combatantId: "goblin", initiative: 3 },
  { type: "initiative.enterRolls", add: [], values: [] },
  { type: "hp.set", combatantId: "goblin", current: 3, max: 7 },
  {
    type: "condition.add",
    combatantId: "goblin",
    condition: { type: "prone" },
  },
  { type: "condition.remove", combatantId: "goblin", conditionType: "prone" },
];

describe("canApply", () => {
  test.each<Actor>([{ kind: "dm" }, { kind: "dmPhone" }])(
    "$kind may send every command",
    (actor) => {
      for (const command of everyCommand)
        expect(canApply(actor, command, owned)).toBe(true);
    },
  );

  test("a player may move their own token on its level", () => {
    const player: Actor = { kind: "player", playerId: "player-1" };
    expect(
      canApply(
        player,
        { type: "token.move", tokenId: "token-aria", to: { col: 4, row: 4 } },
        owned,
      ),
    ).toBe(true);
    expect(
      canApply(
        player,
        {
          type: "token.move",
          tokenId: "token-aria",
          to: { col: 4, row: 4 },
          levelId: "ground",
        },
        owned,
      ),
    ).toBe(true);
  });

  test.each<[string, Actor, Command]>([
    [
      "another player's or a DM token",
      { kind: "player", playerId: "player-1" },
      { type: "token.move", tokenId: "token-goblin", to: { col: 0, row: 0 } },
    ],
    [
      "their token onto another level",
      { kind: "player", playerId: "player-1" },
      {
        type: "token.move",
        tokenId: "token-aria",
        to: { col: 0, row: 0 },
        levelId: "cellar",
      },
    ],
    [
      "as a player who is not in the campaign",
      { kind: "player", playerId: "stranger" },
      { type: "token.move", tokenId: "token-aria", to: { col: 0, row: 0 } },
    ],
    [
      "an unknown token",
      { kind: "player", playerId: "player-1" },
      { type: "token.move", tokenId: "nope", to: { col: 0, row: 0 } },
    ],
  ])("a player may not move %s", (_case, actor, command) => {
    expect(canApply(actor, command, owned)).toBe(false);
  });

  test("a player may send no other command", () => {
    const player: Actor = { kind: "player", playerId: "player-1" };
    for (const command of everyCommand.slice(1))
      expect(canApply(player, command, owned)).toBe(false);
  });
});
