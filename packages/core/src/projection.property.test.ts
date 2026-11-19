// Property-based tests: for random sessions, the projection never leaks hidden tokens, hidden HP
// numbers or anything under unrevealed fog. Expectations come from an independent model
// (axis-aligned revealed rectangles per level), not from the projection's own helpers. For
// random command sequences on top, the projected events never show more than the projected
// state (T-117).
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
  projectEvents,
  projectForViewer,
  type Command,
  type DomainEvent,
  type SessionState,
  type Viewer,
} from "./index.js";
import { ctx, state as base, square } from "./test-data.test-data.js";

const CELL = 100;
const LEVELS = ["ground", "cellar"] as const;
const PLAYERS = ["player-1", "player-2"] as const;

/** Grid cells per side, written out independently of the implementation (SPEC §5). */
function cellsPerSide(size: TokenSize): number {
  if (size === "large") return 2;
  if (size === "huge") return 3;
  if (size === "gargantuan") return 4;
  return 1;
}

// Rectangles start 30 px off the grid, so token centres (multiples of 50 px) never lie on an edge.
const rect = fc.record({
  level: fc.constantFrom(...LEVELS),
  x: fc.integer({ min: 0, max: 8 }).map((n) => n * CELL + 30),
  y: fc.integer({ min: 0, max: 8 }).map((n) => n * CELL + 30),
  size: fc.integer({ min: 1, max: 5 }).map((n) => n * CELL),
});

const visibility = fc.constantFrom<Visibility>(
  "visible",
  "hidden",
  "approximate",
);
const maybe = fc.option(visibility, { nil: undefined });

const tokenSpec = fc.record({
  hasToken: fc.boolean(),
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
  level: fc.constantFrom(...LEVELS),
  owner: fc.constantFrom(undefined, ...PLAYERS),
  withImage: fc.boolean(),
  token: maybe,
  name: maybe,
  hp: maybe,
  conditions: maybe,
  initiative: maybe,
  inCombat: fc.boolean(),
  current: fc.integer({ min: -5, max: 40 }),
  // Overrides on the combatant itself (they win over the token's).
  combatantOverrides: fc.record({
    name: maybe,
    hp: maybe,
    conditions: maybe,
    initiative: maybe,
  }),
});

const session = fc.record({
  entries: fc.array(tokenSpec, { maxLength: 8 }),
  reveals: fc.array(rect, { maxLength: 5 }),
  // Grid offsets in whole cells keep centres off the rectangle edges.
  offset: fc.record({
    x: fc.integer({ min: -2, max: 2 }),
    y: fc.integer({ min: -2, max: 2 }),
  }),
  defaults: fc.record({
    token: maybe,
    name: maybe,
    hp: maybe,
    conditions: maybe,
    initiative: maybe,
  }),
  viewer: fc.constantFrom<Viewer>(
    { kind: "table" },
    ...PLAYERS.map((playerId) => ({ kind: "player" as const, playerId })),
  ),
});

type Spec = typeof session extends fc.Arbitrary<infer T> ? T : never;
type Entry = Spec["entries"][number];
const OVERRIDES = ["token", "name", "hp", "conditions", "initiative"] as const;

const hash = `sha256:${"c".repeat(64)}`;

function build(spec: Spec): SessionState {
  const tokens: Token[] = spec.entries.flatMap((e, i) =>
    e.hasToken
      ? [
          {
            // Distinctive ids/names, so a leak can be found by searching the serialised projection.
            id: `secret-token-${String(i)}`,
            name: `Secret Name ${String(i)}`,
            size: e.size,
            position: { col: e.col, row: e.row },
            levelId: e.level,
            ...(e.owner && { ownerPlayerId: e.owner }),
            ...(e.withImage && {
              image: { path: `tokens/secret-image-${String(i)}.webp`, hash },
            }),
            visibility: Object.fromEntries(
              OVERRIDES.flatMap((key) =>
                e[key] === undefined ? [] : [[key, e[key]]],
              ),
            ),
          },
        ]
      : [],
  );
  const combatants: Combatant[] = spec.entries.flatMap((e, i) =>
    e.inCombat || !e.hasToken
      ? [
          {
            id: `fighter-${String(i)}`,
            name: `Secret Name ${String(i)}`,
            ...(e.hasToken && { tokenId: `secret-token-${String(i)}` }),
            initiative: i,
            visibility: Object.fromEntries(
              Object.entries(e.combatantOverrides).filter(
                ([, value]) => value !== undefined,
              ),
            ),
            hp: { current: e.current, max: 40, temp: 0 },
            conditions: [{ type: "poisoned", remainingRounds: 3 }],
          },
        ]
      : [],
  );
  const defaults = Object.fromEntries(
    Object.entries(spec.defaults).filter(([, value]) => value !== undefined),
  );
  const map = base.scene.map;
  if (!map) throw new Error("sample scene needs a map");
  const start: SessionState = {
    campaign: {
      ...base.campaign,
      players: PLAYERS.map((id) => ({ id, name: id })),
      visibilityDefaults: defaults,
    },
    scene: {
      ...base.scene,
      map: {
        ...map,
        grid: {
          cellSizePx: CELL,
          offsetXPx: spec.offset.x * CELL,
          offsetYPx: spec.offset.y * CELL,
        },
      },
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
      { type: "fog.reveal", levelId: r.level, area: square(r.x, r.y, r.size) },
      ctx,
    );
    if (!result.ok) throw new Error(result.reason);
    return result.state;
  }, start);
}

/** Independent model of what a viewer may see of entry `index`. */
function expected(spec: Spec, index: number) {
  const e: Entry | undefined = spec.entries[index];
  if (!e) throw new Error("no entry");
  const own =
    e.hasToken &&
    spec.viewer.kind === "player" &&
    e.owner === spec.viewer.playerId;
  // Combatant override, then token override, then campaign default; a combatant without a token
  // is off the tracker until released by its own `initiative` override.
  const resolve = (key: (typeof OVERRIDES)[number]): Visibility => {
    if (own) return "visible";
    const fromCombatant =
      key === "token" ? undefined : e.combatantOverrides[key];
    const fromToken = e.hasToken ? e[key] : undefined;
    const fallback =
      key === "initiative" && !e.hasToken
        ? "hidden"
        : (spec.defaults[key] ?? "visible");
    return fromCombatant ?? fromToken ?? fallback;
  };
  // The token itself (and its name/image on the map) follows only token and campaign settings.
  const resolveToken = (key: "token" | "name"): Visibility =>
    own ? "visible" : (e[key] ?? spec.defaults[key] ?? "visible");
  const cx = spec.offset.x * CELL + (e.col + cellsPerSide(e.size) / 2) * CELL;
  const cy = spec.offset.y * CELL + (e.row + cellsPerSide(e.size) / 2) * CELL;
  const revealed = spec.reveals.some(
    (r) =>
      r.level === e.level &&
      cx > r.x &&
      cx < r.x + r.size &&
      cy > r.y &&
      cy < r.y + r.size,
  );
  const tokenVisible =
    e.hasToken && (own || (resolveToken("token") !== "hidden" && revealed));
  const listed =
    (e.inCombat || !e.hasToken) &&
    resolve("initiative") !== "hidden" &&
    (!e.hasToken || tokenVisible);
  return {
    tokenVisible,
    listed,
    tokenNameVisible: resolveToken("name") === "visible",
    nameVisible: resolve("name") === "visible",
    hp: resolve("hp"),
    conditions: resolve("conditions"),
  };
}

const runs = { numRuns: 400 };
const indexOf = (id: string) =>
  Number(id.replace(/^(secret-token|fighter)-/, ""));

describe("projectForViewer (property-based)", () => {
  test("shows exactly the tokens and initiative entries the viewer may see", () => {
    fc.assert(
      fc.property(session, (spec) => {
        const projected = projectForViewer(build(spec), spec.viewer);
        const tokens = new Set(projected.tokens.map((token) => token.id));
        const listed = new Set(
          projected.initiative?.combatants.map((c) => c.id) ?? [],
        );
        spec.entries.forEach((_, i) => {
          const e = expected(spec, i);
          expect(tokens.has(`secret-token-${String(i)}`)).toBe(e.tokenVisible);
          expect(listed.has(`fighter-${String(i)}`)).toBe(e.listed);
        });
      }),
      runs,
    );
  });

  test("never contains ids, names or images the viewer may not see", () => {
    fc.assert(
      fc.property(session, (spec) => {
        const json = JSON.stringify(projectForViewer(build(spec), spec.viewer));
        spec.entries.forEach((_, i) => {
          const e = expected(spec, i);
          const n = String(i);
          if (!e.tokenVisible && !e.listed)
            expect(json).not.toMatch(
              new RegExp(`secret-token-${n}"|fighter-${n}"`),
            );
          if (!e.listed) expect(json).not.toContain(`fighter-${n}"`);
          const nameShown =
            (e.tokenVisible && e.tokenNameVisible) ||
            (e.listed && e.nameVisible);
          if (!nameShown) expect(json).not.toContain(`Secret Name ${n}"`);
          if (!e.tokenNameVisible || !e.tokenVisible)
            expect(json).not.toContain(`secret-image-${n}.webp`);
        });
      }),
      runs,
    );
  });

  test("HP and conditions follow the resolved visibility", () => {
    fc.assert(
      fc.property(session, (spec) => {
        for (const combatant of projectForViewer(build(spec), spec.viewer)
          .initiative?.combatants ?? []) {
          const e = expected(spec, indexOf(combatant.id));
          expect(combatant.hp !== undefined).toBe(e.hp === "visible");
          expect(combatant.hpState !== undefined).toBe(e.hp === "approximate");
          expect(combatant.conditions !== undefined).toBe(
            e.conditions !== "hidden",
          );
          if (e.conditions === "approximate")
            expect(combatant.conditions).toEqual([{ type: "poisoned" }]);
        }
      }),
      runs,
    );
  });

  test("sends exactly the revealed and remembered fog of each level", () => {
    fc.assert(
      fc.property(session, (spec) => {
        const built = build(spec);
        expect(projectForViewer(built, spec.viewer).fog).toEqual(
          built.scene.fog.levels,
        );
      }),
      runs,
    );
  });
});

const index = fc.integer({ min: 0, max: 3 });
const level = fc.constantFrom(...LEVELS);
const area = fc
  .record({
    x: fc.integer({ min: 0, max: 8 }),
    y: fc.integer({ min: 0, max: 8 }),
    size: fc.integer({ min: 1, max: 4 }),
  })
  .map(({ x, y, size }) => square(x * CELL + 30, y * CELL + 30, size * CELL));

/** A new combatant, with or without one of the session's tokens. */
const added = fc
  .record({
    n: fc.integer({ min: 0, max: 99 }),
    token: fc.option(index, { nil: undefined }),
    initiative: fc.option(visibility, { nil: undefined }),
    hp: fc.option(visibility, { nil: undefined }),
  })
  .map(({ n, token, initiative, hp }): Command => ({
    type: "initiative.add",
    combatant: {
      id: `added-${String(n)}`,
      name: `Secret Name added ${String(n)}`,
      ...(token !== undefined && { tokenId: `secret-token-${String(token)}` }),
      initiative: n,
      visibility: {
        ...(initiative && { initiative }),
        ...(hp && { hp }),
      },
      hp: { current: 10, max: 10, temp: 0 },
      conditions: [],
    },
  }));

const move = fc.record({
  type: fc.constant("token.move" as const),
  tokenId: index.map((i) => `secret-token-${String(i)}`),
  to: fc.record({
    col: fc.integer({ min: 0, max: 9 }),
    row: fc.integer({ min: 0, max: 9 }),
  }),
  levelId: level,
});

// Moves weigh most: a leak in them needs a token to pass through fog within one sequence.
const command: fc.Arbitrary<Command> = fc.oneof(
  { arbitrary: move, weight: 4 },
  { arbitrary: added, weight: 2 },
  fc.record({ type: fc.constant("fog.reveal" as const), levelId: level, area }),
  fc.record({
    type: fc.constant("fog.hide" as const),
    levelId: level,
    area,
    remember: fc.boolean(),
  }),
  fc.record({
    type: fc.constant("visibility.set" as const),
    target: index.map((i) => ({
      kind: "token" as const,
      tokenId: `secret-token-${String(i)}`,
    })),
    elementType: fc.constantFrom(
      "token" as const,
      "name" as const,
      "hp" as const,
      "initiative" as const,
    ),
    visibility: fc.constantFrom<Visibility | null>(
      "visible",
      "hidden",
      "approximate",
      null,
    ),
  }),
  fc.record({
    type: fc.constantFrom("hp.change" as const),
    combatantId: fc.oneof(
      index.map((i) => `fighter-${String(i)}`),
      fc.integer({ min: 0, max: 99 }).map((n) => `added-${String(n)}`),
    ),
    amount: fc.integer({ min: -30, max: 30 }),
  }),
  fc.record({
    type: fc.constant("hp.setTemp" as const),
    combatantId: index.map((i) => `fighter-${String(i)}`),
    temp: fc.integer({ min: 0, max: 10 }),
  }),
  fc.constant<Command>({ type: "initiative.next" }),
  fc.record({
    type: fc.constant("initiative.remove" as const),
    combatantId: index.map((i) => `fighter-${String(i)}`),
  }),
);

const scenario = fc.record({
  spec: session,
  commands: fc.array(command, { maxLength: 16 }),
});

/** Applies the commands that are valid, collecting their events; rejected ones are skipped. */
function play(start: SessionState, commands: readonly Command[]) {
  const events: DomainEvent[] = [];
  let current = start;
  for (const next of commands) {
    const result = apply(current, next, ctx);
    if (!result.ok) continue;
    events.push(...result.events);
    current = result.state;
  }
  return { state: current, events };
}

/** The state with one token moved to `to` – what a viewer would see of it standing there. */
function withTokenAt(
  state: SessionState,
  tokenId: string,
  to: { col: number; row: number },
  levelId: string,
): SessionState {
  return {
    ...state,
    scene: {
      ...state.scene,
      tokens: state.scene.tokens.map((token) =>
        token.id === tokenId ? { ...token, position: to, levelId } : token,
      ),
    },
  };
}

describe("projectEvents (property-based)", () => {
  test("mentions only tokens and combatants the projected state shows", () => {
    fc.assert(
      fc.property(scenario, ({ spec, commands }) => {
        const { state, events } = play(build(spec), commands);
        const view = projectForViewer(state, spec.viewer);
        const tokens = new Set(view.tokens.map((token) => token.id));
        const listed = new Set(
          view.initiative?.combatants.map((combatant) => combatant.id) ?? [],
        );
        for (const event of projectEvents(events, state, spec.viewer)) {
          if ("tokenId" in event) expect(tokens).toContain(event.tokenId);
          if ("combatantId" in event)
            expect(listed).toContain(event.combatantId);
        }
      }),
      runs,
    );
  });

  test("shows a move only where the token would be visible", () => {
    fc.assert(
      fc.property(scenario, ({ spec, commands }) => {
        const { state, events } = play(build(spec), commands);
        for (const event of projectEvents(events, state, spec.viewer)) {
          if (event.type !== "token.moved") continue;
          const there = withTokenAt(
            state,
            event.tokenId,
            event.to,
            event.levelId,
          );
          expect(
            projectForViewer(there, spec.viewer).tokens.map((t) => t.id),
          ).toContain(event.tokenId);
        }
      }),
      runs,
    );
  });

  test("shows HP numbers or states only as the projected state does", () => {
    fc.assert(
      fc.property(scenario, ({ spec, commands }) => {
        const { state, events } = play(build(spec), commands);
        const combatants = new Map(
          projectForViewer(state, spec.viewer).initiative?.combatants.map(
            (combatant) => [combatant.id, combatant],
          ),
        );
        for (const event of projectEvents(events, state, spec.viewer)) {
          if (event.type !== "hp.changed") continue;
          const shown = combatants.get(event.combatantId);
          expect(event.hp !== undefined).toBe(shown?.hp !== undefined);
          expect(event.hpState !== undefined).toBe(
            shown?.hpState !== undefined,
          );
        }
      }),
      runs,
    );
  });

  test("never contains names, visibility settings or removed combatants", () => {
    fc.assert(
      fc.property(scenario, ({ spec, commands }) => {
        const { state, events } = play(build(spec), commands);
        const projected = projectEvents(events, state, spec.viewer);
        expect(JSON.stringify(projected)).not.toContain("Secret Name");
        expect(projected.map((event) => event.type)).not.toContain(
          "visibility.changed",
        );
        expect(projected.map((event) => event.type)).not.toContain(
          "initiative.combatantRemoved",
        );
      }),
      runs,
    );
  });
});
