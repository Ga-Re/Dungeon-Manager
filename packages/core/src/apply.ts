import type {
  Combatant,
  InitiativeState,
  LevelFog,
  Polygon,
  Scene,
  Token,
  TokenPosition,
} from "@dungeon-manager/schema";
import {
  discRadius,
  gridFootprint,
  placeFree,
  placeOnCells,
  snapToCells,
  tinyCentres,
  type CellBounds,
} from "./footprint.js";
import type { Command, DomainEvent, RejectionReason } from "./commands.js";
import { EMPTY_LEVEL_FOG, hideArea, revealArea } from "./fog.js";
import { seenByTable, tableLevels } from "./projection.js";
import { goesBefore } from "./initiative.js";
import type { ResolvedMap } from "./map.js";
import type { Ctx, SessionState } from "./state.js";

/** The new state and what happened, or why the command was rejected (state unchanged). */
export type ApplyResult =
  | {
      readonly ok: true;
      readonly state: SessionState;
      readonly events: readonly DomainEvent[];
    }
  | { readonly ok: false; readonly reason: RejectionReason };

type Change =
  | {
      readonly state: SessionState;
      readonly events: readonly DomainEventBody[];
    }
  | RejectionReason;
/** An event without its timestamp; `apply` adds `at` from the injected clock. */
type DomainEventBody = DomainEvent extends infer E
  ? E extends unknown
    ? Omit<E, "at">
    : never
  : never;

/**
 * Applies `command` to `state` (ARCHITECTURE §5.1). Pure: never mutates `state`, uses only `ctx`
 * for time. Permissions are checked separately (`canApply`, T-102b).
 */
export function apply(
  state: SessionState,
  command: Command,
  ctx: Ctx,
): ApplyResult {
  const change = applyChange(state, command);
  if (typeof change === "string") return { ok: false, reason: change };
  return {
    ok: true,
    state: change.state,
    events: change.events.map((event) => ({ ...event, at: ctx.now() })),
  };
}

function applyChange(state: SessionState, command: Command): Change {
  const { scene } = state;
  switch (command.type) {
    case "token.add": {
      const { token } = command;
      if (scene.tokens.some((each) => each.id === token.id))
        return "duplicateToken";
      if (!isCell(token.position)) return "invalidCell";
      if (!state.map) return "noMap";
      if (!hasLevel(state.map, token.levelId)) return "unknownLevel";
      return {
        state: withScene(state, { tokens: [...scene.tokens, token] }),
        events: [{ type: "token.added", tokenId: token.id }],
      };
    }
    case "token.remove": {
      const ids = new Set(command.tokenIds);
      if (
        ids.size === 0 ||
        [...ids].some((id) => !scene.tokens.some((each) => each.id === id))
      )
        return "unknownToken";
      return {
        state: withScene(state, {
          tokens: scene.tokens.filter((each) => !ids.has(each.id)),
        }),
        events: [...ids].map((tokenId) => ({
          type: "token.removed" as const,
          tokenId,
        })),
      };
    }
    case "token.moveMany": {
      const { moves } = command;
      if (moves.length === 0) return "unknownToken";
      if (new Set(moves.map((move) => move.tokenId)).size !== moves.length)
        return "unknownToken";
      const moved = new Map<string, TokenPosition>();
      for (const move of moves) {
        if (!scene.tokens.some((each) => each.id === move.tokenId))
          return "unknownToken";
        if (!isCell(move.to)) return "invalidCell";
        moved.set(move.tokenId, move.to);
      }
      if (!state.map) return "noMap";
      if (command.bounds) {
        const placed = command.free
          ? freely(state, moved, command.bounds)
          : onCells(state, moved, command.bounds);
        if (!placed) return "noFreeCell";
        for (const [id, cell] of placed) moved.set(id, cell);
      }
      // Tokens that end where they stood (e.g. pushed back by an occupied cell) did not move;
      // if none moved, nothing changes and no undo step is recorded.
      for (const each of scene.tokens) {
        const to = moved.get(each.id);
        if (to && to.col === each.position.col && to.row === each.position.row)
          moved.delete(each.id);
      }
      if (moved.size === 0) return { state, events: [] };
      return {
        state: withScene(state, {
          tokens: scene.tokens.map((each) => {
            const to = moved.get(each.id);
            return to ? { ...each, position: to } : each;
          }),
        }),
        events: scene.tokens.flatMap((each) => {
          const to = moved.get(each.id);
          return to
            ? [
                {
                  type: "token.moved" as const,
                  tokenId: each.id,
                  from: each.position,
                  to,
                  levelId: each.levelId,
                },
              ]
            : [];
        }),
      };
    }
    case "token.move": {
      const token = scene.tokens.find(
        (candidate) => candidate.id === command.tokenId,
      );
      if (!token) return "unknownToken";
      if (!isCell(command.to)) return "invalidCell";
      if (!state.map) return "noMap";
      const levelId = command.levelId ?? token.levelId;
      if (!hasLevel(state.map, levelId)) return "unknownLevel";
      return {
        state: withScene(state, {
          tokens: replaceToken(scene, {
            ...token,
            position: command.to,
            levelId,
          }),
        }),
        events: [
          {
            type: "token.moved",
            tokenId: token.id,
            from: token.position,
            to: command.to,
            levelId,
          },
        ],
      };
    }
    case "fog.reveal":
    case "fog.hide": {
      if (!state.map) return "noMap";
      if (!hasLevel(state.map, command.levelId)) return "unknownLevel";
      const current = scene.fog.levels[command.levelId] ?? EMPTY_LEVEL_FOG;
      const next = changeFog(current, command);
      if (!next) return "invalidArea";
      return {
        state: withScene(state, {
          fog: {
            ...scene.fog,
            levels: { ...scene.fog.levels, [command.levelId]: next },
          },
        }),
        events: [
          {
            type: command.type === "fog.reveal" ? "fog.revealed" : "fog.hidden",
            levelId: command.levelId,
          },
        ],
      };
    }
    case "level.show": {
      if (!state.map) return "noMap";
      if (!hasLevel(state.map, command.levelId)) return "unknownLevel";
      const { current, released } = tableLevels(scene, state.map);
      // Already on the TV (also the first level, shown without `table`): nothing changes,
      // nothing to undo (T-118c).
      if (current === command.levelId) return { state, events: [] };
      // What was shown so far stays released – also the first level, shown without `table`.
      const shown = new Set([...released, command.levelId]);
      return {
        state: withScene(state, {
          table: { levelId: command.levelId, shownLevelIds: [...shown] },
        }),
        events: [{ type: "level.shown", levelId: command.levelId }],
      };
    }
    case "combat.start": {
      // Level by level: tokens on different levels never share space. Tokens the table sees
      // first, among themselves: one it does not see (hidden, or in fog) never pushes a seen one
      // aside, which would give it away (DM decision, 2026-11-21); the others fit around them.
      const cells = new Map<string, TokenPosition>();
      const placing = (tokens: readonly Token[]) =>
        tokens.map((each) => ({
          id: each.id,
          position: each.position,
          footprint: gridFootprint(each.size),
        }));
      for (const levelId of new Set(scene.tokens.map((each) => each.levelId))) {
        const onLevel = scene.tokens.filter((each) => each.levelId === levelId);
        const hidden = (each: Token) => !seenByTable(state, each);
        const shown = placing(onLevel.filter((each) => !hidden(each)));
        const visible = snapToCells(shown, command.bounds);
        if (!visible) return "noFreeCell";
        const standing = shown.flatMap((each) => {
          const cell = visible.get(each.id);
          return cell ? [{ position: cell, footprint: each.footprint }] : [];
        });
        const rest = snapToCells(
          placing(onLevel.filter(hidden)),
          command.bounds,
          standing,
        );
        if (!rest) return "noFreeCell";
        for (const [id, cell] of [...visible, ...rest]) cells.set(id, cell);
      }
      const moves = scene.tokens.flatMap((each) => {
        const to = cells.get(each.id);
        return to &&
          (to.col !== each.position.col || to.row !== each.position.row)
          ? [{ token: each, to }]
          : [];
      });
      // Started again with every token on its cell: nothing changes, no undo step.
      if (scene.combat === true && moves.length === 0)
        return { state, events: [] };
      const movedTo = new Map(moves.map(({ token, to }) => [token.id, to]));
      return {
        state: withScene(state, {
          combat: true,
          tokens: scene.tokens.map((each) => {
            const to = movedTo.get(each.id);
            return to ? { ...each, position: to } : each;
          }),
        }),
        events: [
          { type: "combat.changed", combat: true },
          ...moves.map(({ token, to }) => ({
            type: "token.moved" as const,
            tokenId: token.id,
            from: token.position,
            to,
            levelId: token.levelId,
          })),
        ],
      };
    }
    case "combat.end": {
      if (scene.combat !== true) return { state, events: [] };
      const ended: Scene = { ...scene };
      delete ended.combat;
      return {
        state: { ...state, scene: ended },
        events: [{ type: "combat.changed", combat: false }],
      };
    }
    case "scene.setGridMode": {
      if ((scene.gridMode ?? null) === command.gridMode)
        return { state, events: [] };
      const changed: Scene = { ...scene };
      if (command.gridMode === null) delete changed.gridMode;
      else changed.gridMode = command.gridMode;
      return {
        state: { ...state, scene: changed },
        events: [{ type: "gridMode.changed", gridMode: command.gridMode }],
      };
    }
    case "visibility.setTokens": {
      if (command.tokenIds.length === 0) return "unknownToken";
      let current = state;
      const events: DomainEventBody[] = [];
      for (const tokenId of command.tokenIds) {
        const change = applyChange(current, {
          type: "visibility.set",
          target: { kind: "token", tokenId },
          elementType: command.elementType,
          visibility: command.visibility,
        });
        if (typeof change === "string") return change;
        current = change.state;
        events.push(...change.events);
      }
      return { state: current, events };
    }
    case "visibility.set": {
      const { target, elementType, visibility } = command;
      const event = {
        type: "visibility.changed",
        target,
        elementType,
        visibility,
      } as const;
      if (target.kind === "campaign") {
        const visibilityDefaults = setRule(
          state.campaign.visibilityDefaults,
          elementType,
          visibility,
        );
        return {
          state: {
            ...state,
            campaign: { ...state.campaign, visibilityDefaults },
          },
          events: [event],
        };
      }
      if (target.kind === "combatant") {
        const initiative = scene.initiative;
        if (!initiative) return "noInitiative";
        const combatant = initiative.combatants.find(
          (candidate) => candidate.id === target.combatantId,
        );
        if (!combatant) return "unknownCombatant";
        const combatants = initiative.combatants.map((candidate) =>
          candidate.id === combatant.id
            ? {
                ...combatant,
                visibility: setRule(
                  combatant.visibility ?? {},
                  elementType,
                  visibility,
                ),
              }
            : candidate,
        );
        return {
          state: withInitiative(state, { ...initiative, combatants }),
          events: [event],
        };
      }
      const token = scene.tokens.find(
        (candidate) => candidate.id === target.tokenId,
      );
      if (!token) return "unknownToken";
      const updated: Token = {
        ...token,
        visibility: setRule(token.visibility ?? {}, elementType, visibility),
      };
      return {
        state: withScene(state, { tokens: replaceToken(scene, updated) }),
        events: [event],
      };
    }
    case "initiative.add":
      return addCombatant(state, command.combatant);
    case "initiative.addMany": {
      if (command.combatants.length === 0) return { state, events: [] };
      let current = state;
      const events: DomainEventBody[] = [];
      for (const combatant of command.combatants) {
        const change = addCombatant(current, combatant);
        if (typeof change === "string") return change;
        current = change.state;
        events.push(...change.events);
      }
      return { state: current, events };
    }
    case "initiative.start": {
      const initiative = state.scene.initiative;
      if (!initiative || initiative.order.length === 0)
        return "emptyInitiative";
      const fighting = applyChange(state, {
        type: "combat.start",
        bounds: command.bounds,
      });
      if (typeof fighting === "string") return fighting;
      if (initiative.round > 0) return fighting;
      const first = nextTurn(fighting.state);
      if (typeof first === "string") return first;
      return {
        state: first.state,
        events: [...fighting.events, ...first.events],
      };
    }
    case "initiative.end": {
      if (state.scene.initiative === null && state.scene.combat !== true)
        return { state, events: [] };
      const ended = applyChange(withScene(state, { initiative: null }), {
        type: "combat.end",
      });
      if (typeof ended === "string") return ended;
      return {
        state: ended.state,
        events: [{ type: "initiative.changed" }, ...ended.events],
      };
    }
    case "initiative.delay": {
      const initiative = state.scene.initiative;
      if (!initiative) return "noInitiative";
      if (initiative.activeCombatantId !== command.combatantId)
        return "notActive";
      const marked = withInitiative(state, {
        ...initiative,
        combatants: initiative.combatants.map((each) =>
          each.id === command.combatantId ? { ...each, delayed: true } : each,
        ),
      });
      const next = nextTurn(marked);
      if (typeof next === "string") return next;
      return {
        state: next.state,
        events: [{ type: "initiative.changed" }, ...next.events],
      };
    }
    case "initiative.actNow": {
      const initiative = state.scene.initiative;
      if (!initiative) return "noInitiative";
      const combatant = initiative.combatants.find(
        (each) => each.id === command.combatantId,
      );
      if (!combatant) return "unknownCombatant";
      if (
        combatant.delayed !== true ||
        combatant.id === initiative.activeCombatantId
      )
        return "notDelayed";
      // Only into a running turn order; before the first turn nobody acts "now".
      if (initiative.activeCombatantId === null) return "notActive";
      // Before the one whose turn it is; it keeps that place from now on.
      const without = initiative.order.filter((id) => id !== combatant.id);
      const at = Math.max(0, without.indexOf(initiative.activeCombatantId));
      const order = [
        ...without.slice(0, at),
        combatant.id,
        ...without.slice(at),
      ];
      const combatants = initiative.combatants.map((each) => {
        if (each.id !== combatant.id) return each;
        const acting: Combatant = { ...each };
        delete acting.delayed;
        delete acting.ready;
        return acting;
      });
      const { round } = initiative;
      return {
        state: withInitiative(state, {
          ...initiative,
          order,
          combatants,
          activeCombatantId: combatant.id,
          round,
        }),
        events: [
          { type: "initiative.changed" },
          { type: "initiative.turnStarted", round, combatantId: combatant.id },
        ],
      };
    }
    case "initiative.ready": {
      const initiative = state.scene.initiative;
      if (!initiative) return "noInitiative";
      if (
        !initiative.combatants.some((each) => each.id === command.combatantId)
      )
        return "unknownCombatant";
      return {
        state: withInitiative(state, {
          ...initiative,
          combatants: initiative.combatants.map((each) => {
            if (each.id !== command.combatantId) return each;
            const marked: Combatant = { ...each };
            if (command.ready) marked.ready = true;
            else delete marked.ready;
            return marked;
          }),
        }),
        events: [{ type: "initiative.changed" }],
      };
    }
    case "initiative.enterRolls": {
      let current = state;
      const events: DomainEventBody[] = [];
      const steps: Command[] = [
        ...(command.add.length > 0
          ? [{ type: "initiative.addMany" as const, combatants: command.add }]
          : []),
        ...command.values.map((value) => ({
          type: "initiative.setValue" as const,
          combatantId: value.combatantId,
          initiative: value.initiative,
        })),
      ];
      for (const step of steps) {
        const change = applyChange(current, step);
        if (typeof change === "string") return change;
        current = change.state;
        events.push(...change.events);
      }
      // A character found by its token is marked as its player's from now on (ties).
      const owners = new Map(
        command.values.flatMap((value) =>
          value.playerId === undefined
            ? []
            : [[value.combatantId, value.playerId] as const],
        ),
      );
      const initiative = current.scene.initiative;
      if (owners.size > 0 && initiative)
        current = withInitiative(current, {
          ...initiative,
          combatants: initiative.combatants.map((each) => {
            const playerId = owners.get(each.id);
            return playerId === undefined ? each : { ...each, playerId };
          }),
        });
      return current === state
        ? { state, events: [] }
        : { state: current, events };
    }
    case "initiative.setValue": {
      const initiative = state.scene.initiative;
      if (!initiative) return "noInitiative";
      if (!Number.isFinite(command.initiative)) return "invalidAmount";
      const combatant = initiative.combatants.find(
        (each) => each.id === command.combatantId,
      );
      if (!combatant) return "unknownCombatant";
      if (combatant.initiative === command.initiative)
        return { state, events: [] };
      // Placed anew by the ranking rule; its token (even one removed meanwhile), markers, the
      // turn and the round stay.
      const changed = { ...combatant, initiative: command.initiative };
      const others = initiative.order.filter((id) => id !== combatant.id);
      const at = rankedIndex(others, initiative.combatants, changed);
      return {
        state: withInitiative(state, {
          ...initiative,
          order: [...others.slice(0, at), combatant.id, ...others.slice(at)],
          combatants: initiative.combatants.map((each) =>
            each.id === combatant.id ? changed : each,
          ),
        }),
        events: [{ type: "initiative.changed" }],
      };
    }
    case "initiative.move": {
      const initiative = state.scene.initiative;
      if (!initiative) return "noInitiative";
      const from = initiative.order.indexOf(command.combatantId);
      if (from === -1) return "unknownCombatant";
      if (!Number.isFinite(command.index)) return { state, events: [] };
      const without = initiative.order.filter(
        (id) => id !== command.combatantId,
      );
      const at = Math.min(
        Math.max(0, Math.trunc(command.index)),
        without.length,
      );
      if (at === from) return { state, events: [] };
      return {
        state: withInitiative(state, {
          ...initiative,
          order: [
            ...without.slice(0, at),
            command.combatantId,
            ...without.slice(at),
          ],
        }),
        events: [{ type: "initiative.changed" }],
      };
    }
    case "initiative.remove":
      return removeCombatant(state, command.combatantId);
    case "initiative.next":
      return nextTurn(state);
    case "hp.change":
    case "hp.setTemp":
      return changeHp(state, command);
  }
}

/**
 * Where tokens moved to `wanted` end up on the grid (T-233c), level by level: never on an
 * occupied cell. A moved token counts as seen by the table where it stands or where it goes –
 * its redirect would show either way.
 */
function onCells(
  state: SessionState,
  wanted: ReadonlyMap<string, TokenPosition>,
  bounds: Required<CellBounds>,
): Map<string, TokenPosition> | null {
  const result = new Map<string, TokenPosition>();
  const { tokens } = state.scene;
  for (const levelId of new Set(tokens.map((each) => each.levelId))) {
    const onLevel = tokens.filter((each) => each.levelId === levelId);
    const moving = onLevel.flatMap((each) => {
      const to = wanted.get(each.id);
      if (!to) return [];
      const cell = { col: Math.round(to.col), row: Math.round(to.row) };
      return [
        {
          id: each.id,
          wanted: cell,
          from: each.position,
          footprint: gridFootprint(each.size),
          seen:
            seenByTable(state, each) ||
            seenByTable(state, { ...each, position: cell }),
        },
      ];
    });
    if (moving.length === 0) continue;
    const cells = placeOnCells(
      moving,
      onLevel
        .filter((each) => !wanted.has(each.id))
        .map((each) => {
          const footprint = gridFootprint(each.size);
          return {
            position: each.position,
            footprint,
            radius: discRadius(each.size, footprint),
            seen: seenByTable(state, each),
          };
        }),
      bounds,
    );
    if (!cells) return null;
    for (const [id, cell] of cells) result.set(id, cell);
  }
  return result;
}

/**
 * Where tokens moved freely to `wanted` end up (T-233d), level by level: never overlapping
 * another token's disc, with the same rule for what the table sees as `onCells`.
 */
function freely(
  state: SessionState,
  wanted: ReadonlyMap<string, TokenPosition>,
  bounds: Required<CellBounds>,
): Map<string, TokenPosition> | null {
  const result = new Map<string, TokenPosition>();
  const { tokens } = state.scene;
  const shape = (token: Token) => {
    const footprint = gridFootprint(token.size);
    return { footprint, radius: discRadius(token.size, footprint) };
  };
  for (const levelId of new Set(tokens.map((each) => each.levelId))) {
    const onLevel = tokens.filter((each) => each.levelId === levelId);
    const moving = onLevel.flatMap((each) => {
      const to = wanted.get(each.id);
      if (!to) return [];
      return [
        {
          id: each.id,
          wanted: to,
          from: each.position,
          ...shape(each),
          seen:
            seenByTable(state, each) ||
            seenByTable(state, { ...each, position: to }),
        },
      ];
    });
    if (moving.length === 0) continue;
    const staying = onLevel.filter((each) => !wanted.has(each.id));
    // Tiny tokens sharing a cell are kept apart where they are drawn, off its middle.
    const centres = tinyCentres(staying);
    const placed = placeFree(
      moving,
      staying.map((each) => {
        const centre = centres.get(each.id);
        return {
          position: each.position,
          ...shape(each),
          ...(centre && { centre }),
          seen: seenByTable(state, each),
        };
      }),
      bounds,
    );
    if (!placed) return null;
    for (const [id, position] of placed) result.set(id, position);
  }
  return result;
}

function withScene(state: SessionState, changes: Partial<Scene>): SessionState {
  return { ...state, scene: { ...state.scene, ...changes } };
}

function hasLevel(map: ResolvedMap, levelId: string): boolean {
  return map.levels.some((level) => level.id === levelId);
}

/**
 * Positions are finite and non-negative; fractional when placed freely (T-233). Anything else
 * would corrupt the scene file.
 */
function isCell(position: TokenPosition): boolean {
  return (
    Number.isFinite(position.col) &&
    Number.isFinite(position.row) &&
    position.col >= 0 &&
    position.row >= 0
  );
}

/** Rings need three or more finite points: NaN/Infinity would throw or be saved as `null`. */
function isValidArea(area: Polygon): boolean {
  return [area.outer, ...area.holes].every(
    (ring) =>
      ring.length >= 3 &&
      ring.every(([x, y]) => Number.isFinite(x) && Number.isFinite(y)),
  );
}

/** Applies a fog command, or returns `null` for an area the geometry cannot handle. */
function changeFog(
  current: LevelFog,
  command: Extract<Command, { type: "fog.reveal" } | { type: "fog.hide" }>,
): LevelFog | null {
  if (!isValidArea(command.area)) return null;
  try {
    return command.type === "fog.reveal"
      ? revealArea(current, command.area)
      : hideArea(current, command.area, command.remember);
  } catch {
    // polyclip-ts throws on geometry it cannot process; reject instead of crashing the session.
    return null;
  }
}

function replaceToken(scene: Scene, token: Token): Token[] {
  return scene.tokens.map((candidate) =>
    candidate.id === token.id ? token : candidate,
  );
}

/** Sets or (with `null`) removes one entry of a visibility rule map. */
function setRule<K extends string, V>(
  rules: Partial<Record<K, V>>,
  key: K,
  value: V | null,
): Partial<Record<K, V>> {
  if (value !== null) return { ...rules, [key]: value };
  return Object.fromEntries(
    Object.entries(rules).filter(([entry]) => entry !== key),
  ) as Partial<Record<K, V>>;
}

const EMPTY_INITIATIVE: InitiativeState = {
  round: 0,
  activeCombatantId: null,
  order: [],
  combatants: [],
};

function withInitiative(
  state: SessionState,
  initiative: InitiativeState,
): SessionState {
  return withScene(state, { initiative });
}

/**
 * Where `combatant` goes in `order`: behind the last one that does not rank below it (T-111:
 * initiative, then bonus, then players first), so an order changed by hand stays as it is.
 */
function rankedIndex(
  order: readonly string[],
  combatants: readonly Combatant[],
  combatant: Combatant,
): number {
  const byId = new Map(combatants.map((entry) => [entry.id, entry]));
  let at = 0;
  order.forEach((id, index) => {
    const other = byId.get(id);
    if (other && !goesBefore(combatant, other)) at = index + 1;
  });
  return at;
}

function addCombatant(state: SessionState, entering: Combatant): Change {
  // A new combatant has not delayed or readied anything yet (T-111a).
  const combatant: Combatant = { ...entering };
  delete combatant.delayed;
  delete combatant.ready;
  const initiative = state.scene.initiative ?? EMPTY_INITIATIVE;
  if (initiative.combatants.some((existing) => existing.id === combatant.id))
    return "duplicateCombatant";
  if (
    combatant.tokenId !== undefined &&
    !state.scene.tokens.some((token) => token.id === combatant.tokenId)
  ) {
    return "unknownToken";
  }
  const combatants = [...initiative.combatants, combatant];
  const at = rankedIndex(initiative.order, combatants, combatant);
  const order = [
    ...initiative.order.slice(0, at),
    combatant.id,
    ...initiative.order.slice(at),
  ];
  return {
    state: withInitiative(state, { ...initiative, combatants, order }),
    events: [{ type: "initiative.combatantAdded", combatantId: combatant.id }],
  };
}

function removeCombatant(state: SessionState, combatantId: string): Change {
  const initiative = state.scene.initiative;
  if (!initiative) return "noInitiative";
  const index = initiative.order.indexOf(combatantId);
  if (index === -1) return "unknownCombatant";
  const order = initiative.order.filter((id) => id !== combatantId);
  const combatants = initiative.combatants.filter(
    (combatant) => combatant.id !== combatantId,
  );
  const removed = { type: "initiative.combatantRemoved", combatantId } as const;
  if (order.length === 0) {
    // Combat is over; adding combatants later starts again at round 1.
    return {
      state: withInitiative(state, { ...EMPTY_INITIATIVE, combatants }),
      events: [removed],
    };
  }
  if (initiative.activeCombatantId !== combatantId) {
    return {
      state: withInitiative(state, { ...initiative, order, combatants }),
      events: [removed],
    };
  }
  // The turn passes on as with "next turn" (T-111a: delayed ones skipped), from whoever
  // followed the removed combatant; past the end it wraps into the next round.
  return passTurn(
    withInitiative(state, { ...initiative, order, combatants }),
    index,
    [removed],
  );
}

function nextTurn(state: SessionState): Change {
  const initiative = state.scene.initiative;
  if (!initiative) return "noInitiative";
  if (initiative.order.length === 0) return "emptyInitiative";
  const index =
    initiative.activeCombatantId === null
      ? -1
      : initiative.order.indexOf(initiative.activeCombatantId);
  return passTurn(state, index + 1, []);
}

/**
 * Starts the turn of the first combatant from `start` in turn order who has not delayed (T-111a),
 * wrapping past the end into the next round (round 0 becomes 1). If all have delayed, the one
 * at `start` acts and is no longer delayed – a combatant is never active and delayed at once. A
 * held action (`ready`) ends as its own turn starts. `before`: events to report first.
 */
function passTurn(
  state: SessionState,
  start: number,
  before: readonly DomainEventBody[],
): Change {
  const initiative = state.scene.initiative;
  if (!initiative) return "noInitiative";
  const { order } = initiative;
  if (order.length === 0) return "emptyInitiative";
  const delayed = new Set(
    initiative.combatants
      .filter((each) => each.delayed === true)
      .map((each) => each.id),
  );
  let step = 0;
  while (
    step < order.length &&
    delayed.has(order[(start + step) % order.length] ?? "")
  )
    step++;
  if (step >= order.length) step = 0;
  const activeCombatantId = order[(start + step) % order.length];
  if (activeCombatantId === undefined) return "emptyInitiative";
  const wraps = start + step >= order.length;
  const round =
    initiative.round === 0
      ? 1
      : wraps
        ? initiative.round + 1
        : initiative.round;
  const combatants = initiative.combatants.map((each) => {
    if (each.id !== activeCombatantId) return each;
    if (each.ready !== true && each.delayed !== true) return each;
    const acting: Combatant = { ...each };
    delete acting.ready;
    delete acting.delayed;
    return acting;
  });
  return {
    state: withInitiative(state, {
      ...initiative,
      combatants,
      round,
      activeCombatantId,
    }),
    events: [
      ...before,
      { type: "initiative.turnStarted", round, combatantId: activeCombatantId },
    ],
  };
}

function changeHp(
  state: SessionState,
  command: Extract<Command, { type: "hp.change" } | { type: "hp.setTemp" }>,
): Change {
  const initiative = state.scene.initiative;
  if (!initiative) return "noInitiative";
  const combatant = initiative.combatants.find(
    (candidate) => candidate.id === command.combatantId,
  );
  if (!combatant) return "unknownCombatant";
  const { hp } = combatant;
  if (!hp) return "hpNotTracked";

  let next: NonNullable<Combatant["hp"]>;
  if (command.type === "hp.setTemp") {
    if (!Number.isInteger(command.temp) || command.temp < 0)
      return "invalidAmount";
    // Temporary HP do not stack (5e); the new value replaces the old one.
    next = { ...hp, temp: command.temp };
  } else {
    const { amount } = command;
    if (!Number.isInteger(amount) || amount === 0) return "invalidAmount";
    if (amount > 0) {
      // Healing never lowers HP that are above the maximum (e.g. after a reduced max).
      next = {
        ...hp,
        current: Math.max(hp.current, Math.min(hp.max, hp.current + amount)),
      };
    } else {
      const absorbed = Math.min(hp.temp, -amount);
      next = {
        ...hp,
        temp: hp.temp - absorbed,
        current: Math.max(0, hp.current - (-amount - absorbed)),
      };
    }
  }
  const combatants = initiative.combatants.map((candidate) =>
    candidate.id === combatant.id ? { ...combatant, hp: next } : candidate,
  );
  return {
    state: withInitiative(state, { ...initiative, combatants }),
    events: [
      {
        type: "hp.changed",
        combatantId: combatant.id,
        current: next.current,
        temp: next.temp,
      },
    ],
  };
}
