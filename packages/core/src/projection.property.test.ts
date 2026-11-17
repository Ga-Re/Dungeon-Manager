// Property-based tests: for random sessions, the projection never leaks hidden tokens, hidden HP
// numbers or anything under unrevealed fog. Expectations come from an independent model (axis-
// aligned revealed rectangles), not from the projection's own helpers.
import type {
  Combatant,
  Token,
  TokenSize,
  Visibility,
} from "@dungeon-manager/schema";
import fc from "fast-check";
import { describe, expect, test } from "vitest";
import {
  apply,
  projectForViewer,
  type SessionState,
  type Viewer,
} from "./index.js";
import { ctx, state as base, square } from "./test-data.test-data.js";

const CELL = 100;
const SPAN: Record<TokenSize, number> = {
  tiny: 1,
  small: 1,
  medium: 1,
  large: 2,
  huge: 3,
  gargantuan: 4,
};
const PLAYERS = ["player-1", "player-2"] as const;

// Rectangles start 30 px off the grid, so token centres (multiples of 50 px) never lie on an edge.
const rect = fc.record({
  x: fc.integer({ min: 0, max: 8 }).map((n) => n * CELL + 30),
  y: fc.integer({ min: 0, max: 8 }).map((n) => n * CELL + 30),
  size: fc.integer({ min: 1, max: 5 }).map((n) => n * CELL),
});

const visibility = fc.constantFrom<Visibility>(
  "visible",
  "hidden",
  "approximate",
);
const maybeVisibility = fc.option(visibility, { nil: undefined });

const tokenSpec = fc.record({
  size: fc.constantFrom<TokenSize>(
    "tiny",
    "small",
    "medium",
    "large",
    "huge",
    "gargantuan",
  ),
  col: fc.integer({ min: 0, max: 9 }),
  row: fc.integer({ min: 0, max: 9 }),
  owner: fc.constantFrom(undefined, ...PLAYERS),
  token: maybeVisibility,
  name: maybeVisibility,
  hp: maybeVisibility,
  inCombat: fc.boolean(),
  current: fc.integer({ min: -5, max: 40 }),
});

const session = fc.record({
  tokens: fc.array(tokenSpec, { maxLength: 8 }),
  reveals: fc.array(rect, { maxLength: 4 }),
  defaults: fc.record({
    token: maybeVisibility,
    name: maybeVisibility,
    hp: maybeVisibility,
  }),
  viewer: fc.constantFrom<Viewer>(
    { kind: "table" },
    ...PLAYERS.map((playerId) => ({ kind: "player" as const, playerId })),
  ),
});

type Spec = typeof session extends fc.Arbitrary<infer T> ? T : never;

function build(spec: Spec): SessionState {
  const tokens: Token[] = spec.tokens.map((t, i) => ({
    // Distinctive ids/names, so a leak can be found by searching the serialised projection.
    id: `secret-token-${String(i)}`,
    name: `Secret Name ${String(i)}`,
    size: t.size,
    position: { col: t.col, row: t.row },
    levelId: "ground",
    ...(t.owner && { ownerPlayerId: t.owner }),
    visibility: Object.fromEntries(
      Object.entries({ token: t.token, name: t.name, hp: t.hp }).filter(
        ([, value]) => value !== undefined,
      ),
    ),
  }));
  const combatants: Combatant[] = spec.tokens.flatMap((t, i) =>
    t.inCombat
      ? [
          {
            id: `fighter-${String(i)}`,
            name: `Secret Name ${String(i)}`,
            tokenId: `secret-token-${String(i)}`,
            initiative: i,
            hp: { current: t.current, max: 40, temp: 0 },
            conditions: [],
          },
        ]
      : [],
  );
  const defaults = Object.fromEntries(
    Object.entries(spec.defaults).filter(([, value]) => value !== undefined),
  );
  const start: SessionState = {
    campaign: {
      ...base.campaign,
      players: PLAYERS.map((id) => ({ id, name: id })),
      visibilityDefaults: defaults,
    },
    scene: {
      ...base.scene,
      tokens,
      initiative:
        combatants.length > 0
          ? {
              round: 1,
              activeCombatantId: combatants[0]?.id ?? null,
              order: combatants.map((c) => c.id),
              combatants,
            }
          : null,
    },
  };
  return spec.reveals.reduce((current, r) => {
    const result = apply(
      current,
      { type: "fog.reveal", levelId: "ground", area: square(r.x, r.y, r.size) },
      ctx,
    );
    if (!result.ok) throw new Error(result.reason);
    return result.state;
  }, start);
}

/** Independent model of what a viewer may see. */
function expected(spec: Spec, index: number) {
  const t = spec.tokens[index];
  if (!t) throw new Error("no token");
  const own = spec.viewer.kind === "player" && t.owner === spec.viewer.playerId;
  const resolve = (key: "token" | "name" | "hp") =>
    t[key] ?? spec.defaults[key] ?? "visible";
  const cx = (t.col + SPAN[t.size] / 2) * CELL;
  const cy = (t.row + SPAN[t.size] / 2) * CELL;
  const revealed = spec.reveals.some(
    (r) => cx > r.x && cx < r.x + r.size && cy > r.y && cy < r.y + r.size,
  );
  const tokenVisible = own || (resolve("token") !== "hidden" && revealed);
  return {
    tokenVisible,
    nameVisible: tokenVisible && (own || resolve("name") === "visible"),
    exactHp: tokenVisible && (own || resolve("hp") === "visible"),
  };
}

const runs = { numRuns: 300 };

describe("projectForViewer (property-based)", () => {
  test("shows exactly the tokens the viewer may see", () => {
    fc.assert(
      fc.property(session, (spec) => {
        const shown = new Set(
          projectForViewer(build(spec), spec.viewer).tokens.map(
            (token) => token.id,
          ),
        );
        spec.tokens.forEach((_, i) => {
          expect(shown.has(`secret-token-${String(i)}`)).toBe(
            expected(spec, i).tokenVisible,
          );
        });
      }),
      runs,
    );
  });

  test("never contains the id or name of a token the viewer may not see", () => {
    fc.assert(
      fc.property(session, (spec) => {
        const json = JSON.stringify(projectForViewer(build(spec), spec.viewer));
        spec.tokens.forEach((_, i) => {
          const e = expected(spec, i);
          if (!e.tokenVisible)
            expect(json).not.toMatch(
              new RegExp(`secret-token-${String(i)}"|fighter-${String(i)}"`),
            );
          if (!e.nameVisible)
            expect(json).not.toContain(`Secret Name ${String(i)}"`);
        });
      }),
      runs,
    );
  });

  test("exact HP numbers appear only where HP are visible to the viewer", () => {
    fc.assert(
      fc.property(session, (spec) => {
        const combatants =
          projectForViewer(build(spec), spec.viewer).initiative?.combatants ??
          [];
        for (const combatant of combatants) {
          const index = Number(combatant.id.replace("fighter-", ""));
          expect(combatant.hp !== undefined).toBe(
            expected(spec, index).exactHp,
          );
        }
      }),
      runs,
    );
  });

  test("sends only revealed and remembered fog, unchanged", () => {
    fc.assert(
      fc.property(session, (spec) => {
        const built = build(spec);
        const projected = projectForViewer(built, spec.viewer);
        expect(projected.fog).toEqual(built.scene.fog.levels);
      }),
      runs,
    );
  });
});
