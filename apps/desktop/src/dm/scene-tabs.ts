import type { Scene } from "@dungeon-manager/schema";

// The open scenes' tabs (T-223a) as one state, changed only through these functions (functional
// updates: an async step such as deleting a scene must not work on what was open before it).

/** The open scenes, the shown one and the one on the TV. */
export interface SceneTabsState {
  readonly open: readonly Scene[];
  readonly active: string | null;
  /** On the TV; switching tabs never changes it (DM decision, 2026-11-20). */
  readonly tv: string | null;
  /**
   * The TV is dark on purpose (after a crash, T-114a): no scene goes there until the DM sends
   * one, not even a newly opened one.
   */
  readonly holdTv?: boolean;
}

export const NO_SCENE_TABS: SceneTabsState = {
  open: [],
  active: null,
  tv: null,
};

/**
 * Shows `scene`: an open one just becomes the shown tab (keeping its edits; the TV stays as it
 * is), a new one is added. Only a newly opened scene goes on a dark TV, as before tabs.
 */
export function openSceneTab(
  state: SceneTabsState,
  scene: Scene,
): SceneTabsState {
  if (state.open.some((each) => each.id === scene.id))
    return { ...state, active: scene.id };
  return {
    ...state,
    open: [...state.open, scene],
    active: scene.id,
    tv: state.tv ?? (state.holdTv === true ? null : scene.id),
  };
}

/** Shows the open scene `id`. */
export function selectSceneTab(
  state: SceneTabsState,
  id: string,
): SceneTabsState {
  return state.open.some((each) => each.id === id)
    ? { ...state, active: id }
    : state;
}

/**
 * Closes the tabs `ids` (e.g. a deleted scene and its deleted sub-scenes). If the shown one
 * goes, its neighbour shows; if the TV's goes, the TV is dark – no other scene takes its place.
 */
export function closeSceneTabs(
  state: SceneTabsState,
  ids: readonly string[],
): SceneTabsState {
  const open = state.open.filter((each) => !ids.includes(each.id));
  const activeGone = state.active !== null && ids.includes(state.active);
  const index = state.open.findIndex((each) => each.id === state.active);
  // The neighbour: the next remaining tab after the shown one, else the one before it.
  const neighbour =
    state.open.slice(index + 1).find((each) => !ids.includes(each.id)) ??
    open.at(-1);
  return {
    ...state,
    open,
    active: activeGone ? (neighbour?.id ?? null) : state.active,
    tv: state.tv !== null && ids.includes(state.tv) ? null : state.tv,
  };
}

/** Puts the open scene `id` on the TV. */
export function sendSceneTabToTv(
  state: SceneTabsState,
  id: string,
): SceneTabsState {
  return state.open.some((each) => each.id === id)
    ? { ...state, tv: id, holdTv: false }
    : state;
}

/** Replaces an open scene by its newer state (e.g. after its map changed). */
export function replaceSceneTab(
  state: SceneTabsState,
  scene: Scene,
): SceneTabsState {
  return {
    ...state,
    open: state.open.map((each) => (each.id === scene.id ? scene : each)),
  };
}

/** The tabs remembered on this device for a campaign (T-114a). */
export interface RememberedSceneTabs {
  readonly open: readonly string[];
  readonly active: string | null;
  /** The scene to put on the TV; `null` when it was dark at the end, and after a crash. */
  readonly tv: string | null;
  /** The last session crashed: the TV stays dark until the DM sends a scene (DM decision). */
  readonly afterCrash?: boolean;
}

/**
 * The tabs to start with: the remembered scenes that still exist, in their order, after any the
 * DM opened already (they stay, as does a scene they put on the TV); a scene that is gone is
 * skipped, also as the shown one or the TV's.
 */
export function restoreSceneTabs(
  current: SceneTabsState,
  scenes: readonly Scene[],
  remembered: RememberedSceneTabs,
): SceneTabsState {
  const open = [
    ...current.open,
    ...remembered.open.flatMap((id) => {
      const scene = scenes.find((each) => each.id === id);
      return scene && !current.open.some((each) => each.id === id)
        ? [scene]
        : [];
    }),
  ];
  const has = (id: string | null) =>
    id !== null && open.some((each) => each.id === id);
  const afterCrash = remembered.afterCrash === true;
  return {
    open,
    active:
      current.active ??
      (has(remembered.active) ? remembered.active : (open.at(-1)?.id ?? null)),
    tv:
      current.tv ?? (!afterCrash && has(remembered.tv) ? remembered.tv : null),
    holdTv: current.tv === null && afterCrash,
  };
}
