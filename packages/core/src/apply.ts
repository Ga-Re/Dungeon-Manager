import type {
  Combatant,
  GridCell,
  InitiativeState,
  LevelFog,
  Polygon,
  Scene,
  Token,
} from "@dungeon-manager/schema";
import type { Command, DomainEvent, RejectionReason } from "./commands.js";
import { EMPTY_LEVEL_FOG, hideArea, revealArea } from "./fog.js";
import { tableLevels } from "./projection.js";
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
    case "token.move": {
      const token = scene.tokens.find(
        (candidate) => candidate.id === command.tokenId,
      );
      if (!token) return "unknownToken";
      if (!isCell(command.to)) return "invalidCell";
      if (!scene.map) return "noMap";
      const levelId = command.levelId ?? token.levelId;
      if (!hasLevel(scene, levelId)) return "unknownLevel";
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
      if (!scene.map) return "noMap";
      if (!hasLevel(scene, command.levelId)) return "unknownLevel";
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
      if (!scene.map) return "noMap";
      if (!hasLevel(scene, command.levelId)) return "unknownLevel";
      const { current, released } = tableLevels(scene);
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
    case "initiative.remove":
      return removeCombatant(state, command.combatantId);
    case "initiative.next":
      return nextTurn(state);
    case "hp.change":
    case "hp.setTemp":
      return changeHp(state, command);
  }
}

function withScene(state: SessionState, changes: Partial<Scene>): SessionState {
  return { ...state, scene: { ...state.scene, ...changes } };
}

function hasLevel(scene: Scene, levelId: string): boolean {
  return scene.map?.levels.some((level) => level.id === levelId) ?? false;
}

/** Grid cells are non-negative integers; anything else would corrupt the scene file. */
function isCell(cell: GridCell): boolean {
  return (
    Number.isInteger(cell.col) &&
    Number.isInteger(cell.row) &&
    cell.col >= 0 &&
    cell.row >= 0
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

function addCombatant(state: SessionState, combatant: Combatant): Change {
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
  const initiativeOf = new Map(
    combatants.map((entry) => [entry.id, entry.initiative]),
  );
  // Insert after everyone with an equal or higher initiative; the rest of the order (which may
  // have been changed by hand, e.g. delay/ready) stays as it is.
  const position = initiative.order.findIndex(
    (id) => (initiativeOf.get(id) ?? 0) < combatant.initiative,
  );
  const at = position === -1 ? initiative.order.length : position;
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
  // The turn passes to whoever followed the removed combatant; past the end it wraps into the next round.
  const wraps = index >= order.length;
  const activeCombatantId = (wraps ? order[0] : order[index]) ?? null;
  const round = wraps ? initiative.round + 1 : initiative.round;
  return {
    state: withInitiative(state, {
      ...initiative,
      order,
      combatants,
      activeCombatantId,
      round,
    }),
    events:
      activeCombatantId === null
        ? [removed]
        : [
            removed,
            {
              type: "initiative.turnStarted",
              round,
              combatantId: activeCombatantId,
            },
          ],
  };
}

function nextTurn(state: SessionState): Change {
  const initiative = state.scene.initiative;
  if (!initiative) return "noInitiative";
  const first = initiative.order[0];
  if (first === undefined) return "emptyInitiative";
  const index =
    initiative.activeCombatantId === null
      ? -1
      : initiative.order.indexOf(initiative.activeCombatantId);
  const wraps = index + 1 >= initiative.order.length;
  const activeCombatantId = wraps
    ? first
    : (initiative.order[index + 1] ?? first);
  const round =
    initiative.round === 0
      ? 1
      : wraps
        ? initiative.round + 1
        : initiative.round;
  return {
    state: withInitiative(state, { ...initiative, round, activeCombatantId }),
    events: [
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
