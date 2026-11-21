import {
  type Scene,
  viewerEventSchema,
  viewerSceneSchema,
  type ApproximateHp,
  type Combatant,
  type Token,
  type ViewerCombatant,
  type ViewerEvent,
  type ViewerScene,
  type ViewerToken,
  type Visibility,
  type VisibilityElementType,
  type VisibilityRules,
} from "@dungeon-manager/schema";
import type { DomainEvent } from "./commands.js";
import { gridFootprint } from "./footprint.js";
import { isInside } from "./fog.js";
import type { SessionState } from "./state.js";

/** Who looks at the projected state: the table TV (all players) or one player's companion. */
export type Viewer =
  | { readonly kind: "table" }
  | { readonly kind: "player"; readonly playerId: string };

/**
 * What `viewer` may see of `state` (ARCHITECTURE §5.1). Hidden data never leaves the host:
 * the result is built field by field from an allow-list and checked against the strict viewer
 * schema, so an accidentally added field fails loudly instead of leaking.
 *
 * Semantics: a token shows when it is not hidden and its centre lies in revealed fog (a large
 * token partly revealed but centred in fog stays hidden – conservative). "approximate" means
 * shown for tokens and initiative entries, coarse for HP, type-only for conditions, hidden for
 * names (and token images). Runs per state change or broadcast, never per frame.
 */
export function projectForViewer(
  state: SessionState,
  viewer: Viewer,
): ViewerScene {
  const { scene, map } = state;
  const { current, released } = tableLevels(scene, map);
  const visibleTokens = scene.tokens.filter((token) =>
    isTokenVisible(state, token, viewer, released),
  );
  const visibleTokenIds = new Set(visibleTokens.map((token) => token.id));
  // Asset references are capabilities: only the host-rendered table view gets them (T-118a).
  const withAssets = viewer.kind === "table";
  const projected: ViewerScene = {
    id: scene.id,
    name: scene.name,
    map:
      map && current !== null
        ? {
            kind: map.kind,
            ...(withAssets && {
              asset: { path: map.asset.path, hash: map.asset.hash },
            }),
            currentLevelId: current,
            grid: {
              cellSizePx: map.grid.cellSizePx,
              offsetXPx: map.grid.offsetXPx,
              offsetYPx: map.grid.offsetYPx,
            },
            levels: map.levels
              .filter((level) => released.has(level.id))
              .map((level) => ({
                id: level.id,
                name: level.name,
                ...(withAssets &&
                  level.asset && {
                    asset: { path: level.asset.path, hash: level.asset.hash },
                  }),
              })),
          }
        : null,
    fog: Object.fromEntries(
      Object.entries(scene.fog.levels)
        .filter(([levelId]) => released.has(levelId))
        .map(([levelId, fog]) => [
          levelId,
          {
            revealed: fog.revealed.map(copyPolygon),
            remembered: fog.remembered.map(copyPolygon),
          },
        ]),
    ),
    tokens: visibleTokens.map((token) => projectToken(state, token, viewer)),
    ...projectInitiative(state, viewer, visibleTokenIds),
  };
  return viewerSceneSchema.parse(projected);
}

/**
 * The events `viewer` may learn of (ARCHITECTURE §5.1), for the session log shown to players
 * and any event broadcast. `events` and `stateAfter` must be the result of ONE `apply`: an
 * event passes only when its subject shows in `projectForViewer(stateAfter, viewer)`, with no
 * more detail than that projection gives. Judging older events against a later state would
 * leak what was hidden at the time (a hidden token's path, HP while hidden), so a log keeps the
 * projected events and never projects its history again.
 *
 * - `token.moved`: when the token is visible where it moved to; without `from`, which may lie
 *   in fog and whose level is not known.
 * - Fog changes pass for released levels, like the projected state's fog; `level.shown` passes.
 * - `initiative.combatantAdded`, `initiative.turnStarted`: when the combatant is listed.
 * - `hp.changed`: exact or coarse HP, as the listed combatant's HP show. A change within the
 *   same coarse state still passes: that a creature was hit is seen at the table anyway.
 * - `visibility.changed` and `initiative.combatantRemoved` never pass: the first is the DM's
 *   setup, the second concerns a combatant no longer in the state to judge it by.
 * - `token.added` and `token.removed` never pass (T-107a): tokens appear and go in the projected
 *   view itself; the players' log names neither (a removed one is gone from the state).
 */
export function projectEvents(
  events: readonly DomainEvent[],
  stateAfter: SessionState,
  viewer: Viewer,
): ViewerEvent[] {
  const view = projectForViewer(stateAfter, viewer);
  const visibleTokens = new Set(view.tokens.map((token) => token.id));
  const { released } = tableLevels(stateAfter.scene, stateAfter.map);
  const listed = new Map(
    view.initiative?.combatants.map((combatant) => [combatant.id, combatant]),
  );
  const maxHp = new Map(
    stateAfter.scene.initiative?.combatants.map((combatant) => [
      combatant.id,
      combatant.hp?.max,
    ]),
  );
  const project = (event: DomainEvent): ViewerEvent | null => {
    const { at } = event;
    switch (event.type) {
      case "token.moved": {
        // In one `apply` the move's target is where the token now stands.
        if (!visibleTokens.has(event.tokenId)) return null;
        return {
          at,
          type: event.type,
          tokenId: event.tokenId,
          to: { col: event.to.col, row: event.to.row },
          levelId: event.levelId,
        };
      }
      case "fog.revealed":
      case "fog.hidden":
      case "level.shown":
        return released.has(event.levelId)
          ? { at, type: event.type, levelId: event.levelId }
          : null;
      case "initiative.combatantAdded":
        return listed.has(event.combatantId)
          ? { at, type: event.type, combatantId: event.combatantId }
          : null;
      case "initiative.turnStarted":
        return listed.has(event.combatantId)
          ? {
              at,
              type: event.type,
              round: event.round,
              combatantId: event.combatantId,
            }
          : null;
      case "hp.changed": {
        const shown = listed.get(event.combatantId);
        const max = maxHp.get(event.combatantId);
        const base = { at, type: event.type, combatantId: event.combatantId };
        if (shown?.hp)
          return { ...base, hp: { current: event.current, temp: event.temp } };
        if (shown?.hpState && max !== undefined)
          return { ...base, hpState: approximateHp(event.current, max) };
        return null;
      }
      // Tokens appear and go in the projected view itself; the players' log names neither.
      case "token.added":
      case "token.removed":
      case "visibility.changed":
      case "initiative.combatantRemoved":
        return null;
    }
  };
  return events.flatMap((event) => {
    const projected = project(event);
    return projected ? [viewerEventSchema.parse(projected)] : [];
  });
}

/**
 * The level on the TV and the released levels (SPEC §3.1, T-118a): `scene.table` where it names
 * levels of the scene's resolved `map`, else the map's first level; ids of levels the map no
 * longer has are ignored. `current` is `null` only without a map.
 */
export function tableLevels(
  scene: Scene,
  map: { readonly levels: readonly { readonly id: string }[] } | null,
): {
  readonly current: string | null;
  readonly released: ReadonlySet<string>;
} {
  const levels = new Set(map?.levels.map((level) => level.id));
  const wanted = scene.table?.levelId;
  const current =
    wanted !== undefined && levels.has(wanted)
      ? wanted
      : (map?.levels[0]?.id ?? null);
  const released = new Set(
    (scene.table?.shownLevelIds ?? []).filter((id) => levels.has(id)),
  );
  if (current !== null) released.add(current);
  return { current, released };
}

function copyPolygon(polygon: {
  outer: readonly [number, number][];
  holes: readonly (readonly [number, number][])[];
}) {
  return {
    outer: polygon.outer.map(([x, y]): [number, number] => [x, y]),
    holes: polygon.holes.map((hole) =>
      hole.map(([x, y]): [number, number] => [x, y]),
    ),
  };
}

/**
 * Element visibility (SPEC §6): the combatant's override, else the token's, else the campaign
 * default, else visible. A combatant without a token is hidden from the initiative until the DM
 * releases it (e.g. monsters entered before their token is placed – no ambush on the TV).
 */
function visibilityOf(
  state: SessionState,
  elementType: VisibilityElementType,
  token?: Token,
  combatant?: Combatant,
): Visibility {
  const fallback =
    elementType === "initiative" && combatant && combatant.tokenId === undefined
      ? "hidden"
      : (state.campaign.visibilityDefaults[elementType] ?? "visible");
  return (
    combatant?.visibility?.[elementType] ??
    token?.visibility?.[elementType] ??
    fallback
  );
}

/**
 * Whether the players see `token` at all as far as its visibility goes (T-107b): its own
 * setting, else the campaign's default (`defaults`), else visible. Fog and levels come on top.
 */
export function tokenVisibility(
  defaults: VisibilityRules,
  token: Pick<Token, "visibility">,
): Visibility {
  return token.visibility?.token ?? defaults.token ?? "visible";
}

function ownedBy(token: Token | undefined, viewer: Viewer): boolean {
  return viewer.kind === "player" && token?.ownerPlayerId === viewer.playerId;
}

/**
 * Never on an unreleased level (its id alone would give the level away); else visible unless
 * hidden or standing outside the revealed fog of its level; own tokens always show.
 */
function isTokenVisible(
  state: SessionState,
  token: Token,
  viewer: Viewer,
  released: ReadonlySet<string>,
): boolean {
  if (!released.has(token.levelId)) return false;
  if (ownedBy(token, viewer)) return true;
  if (visibilityOf(state, "token", token) === "hidden") return false;
  const { map } = state;
  if (!map) return false;
  const { cols, rows } = gridFootprint(token.size);
  const cell = map.grid.cellSizePx;
  const centre: [number, number] = [
    map.grid.offsetXPx + (token.position.col + cols / 2) * cell,
    map.grid.offsetYPx + (token.position.row + rows / 2) * cell,
  ];
  return isInside(
    state.scene.fog.levels[token.levelId]?.revealed ?? [],
    centre,
  );
}

function projectToken(
  state: SessionState,
  token: Token,
  viewer: Viewer,
): ViewerToken {
  const showName =
    ownedBy(token, viewer) || visibilityOf(state, "name", token) === "visible";
  return {
    id: token.id,
    ...(showName && { name: token.name }),
    size: token.size,
    position: { col: token.position.col, row: token.position.row },
    levelId: token.levelId,
    // The image file name (e.g. "doppelganger.webp") would give away an unnamed token's identity.
    ...(showName &&
      token.image && {
        image: { path: token.image.path, hash: token.image.hash },
      }),
  };
}

function projectInitiative(
  state: SessionState,
  viewer: Viewer,
  visibleTokenIds: ReadonlySet<string>,
): Pick<ViewerScene, "initiative"> {
  const initiative = state.scene.initiative;
  if (!initiative) return {};
  const byId = new Map(
    initiative.combatants.map((combatant) => [combatant.id, combatant]),
  );
  const tokensById = new Map(
    state.scene.tokens.map((token) => [token.id, token]),
  );
  const tokenOf = (combatant: Combatant) =>
    combatant.tokenId === undefined
      ? undefined
      : tokensById.get(combatant.tokenId);
  // An entry is listed when its initiative visibility (token override, else campaign default)
  // is not hidden, and – for combatants with a token – while that token is visible.
  const visible = initiative.order
    .map((id) => byId.get(id))
    .filter((combatant): combatant is Combatant => combatant !== undefined)
    .filter((combatant) => {
      const token = tokenOf(combatant);
      const own = ownedBy(token, viewer);
      if (
        !own &&
        visibilityOf(state, "initiative", token, combatant) === "hidden"
      )
        return false;
      return (
        combatant.tokenId === undefined ||
        visibleTokenIds.has(combatant.tokenId)
      );
    });
  if (visible.length === 0 && visibilityOf(state, "initiative") === "hidden")
    return {};
  const visibleIds = new Set(visible.map((combatant) => combatant.id));
  return {
    initiative: {
      round: initiative.round,
      activeCombatantId:
        initiative.activeCombatantId !== null &&
        visibleIds.has(initiative.activeCombatantId)
          ? initiative.activeCombatantId
          : null,
      combatants: visible.map((combatant) =>
        projectCombatant(state, combatant, tokenOf(combatant), viewer),
      ),
    },
  };
}

function projectCombatant(
  state: SessionState,
  combatant: Combatant,
  token: Token | undefined,
  viewer: Viewer,
): ViewerCombatant {
  const own = ownedBy(token, viewer);
  const nameVisible =
    own || visibilityOf(state, "name", token, combatant) === "visible";
  const hpVisibility = own
    ? "visible"
    : visibilityOf(state, "hp", token, combatant);
  const conditionVisibility = own
    ? "visible"
    : visibilityOf(state, "conditions", token, combatant);
  const { hp } = combatant;
  return {
    id: combatant.id,
    ...(nameVisible && { name: combatant.name }),
    ...(combatant.tokenId !== undefined && { tokenId: combatant.tokenId }),
    ...(hp &&
      hpVisibility === "visible" && {
        hp: { current: hp.current, max: hp.max, temp: hp.temp },
      }),
    ...(hp &&
      hpVisibility === "approximate" && {
        hpState: approximateHp(hp.current, hp.max),
      }),
    ...(conditionVisibility !== "hidden" && {
      conditions: combatant.conditions.map((condition) => ({
        type: condition.type,
        // "approximate": which conditions, but not how long they last.
        ...(conditionVisibility === "visible" &&
          condition.remainingRounds !== undefined && {
            remainingRounds: condition.remainingRounds,
          }),
      })),
    }),
  };
}

/** Coarse HP state (SPEC §6): unhurt, wounded, badly wounded (at most half), down (0 or less). */
export function approximateHp(current: number, max: number): ApproximateHp {
  if (current <= 0) return "down";
  if (current >= max) return "unhurt";
  return current <= max / 2 ? "badlyWounded" : "wounded";
}
