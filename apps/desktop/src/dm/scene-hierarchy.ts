// Sub-scenes (T-152): which scene is under which, and where a scene shows in the browser.
// Pure: built from the scene and session lists as read.
import type { SceneEntry, SessionEntry } from "./campaign-data.js";
import type { SceneSlot } from "./tree-ids.js";

/** Who is under whom; scenes in their list order. */
export interface SceneHierarchy {
  /** A scene's parent, or `null` when it is a top-level scene. */
  readonly parentOf: (sceneId: string) => string | null;
  /** A scene's direct sub-scenes. */
  readonly childrenOf: (sceneId: string) => readonly string[];
  /** All sub-scenes below a scene, parents before their children. */
  readonly descendantsOf: (sceneId: string) => readonly string[];
}

/**
 * The hierarchy of `scenes`. A parent that is not in the list (deleted, not synced yet) or a
 * loop written by hand makes the scene a top-level scene, so every scene still shows.
 */
export function sceneHierarchy(scenes: readonly SceneEntry[]): SceneHierarchy {
  const known = new Set(scenes.map((entry) => entry.id));
  const declared = new Map(
    scenes.map((entry) => [entry.id, entry.scene?.parentSceneId ?? null]),
  );
  const parents = new Map<string, string | null>();
  for (const entry of scenes) {
    const parent = declared.get(entry.id) ?? null;
    // Walk up: the parent must exist, and the way up must never come back to this scene.
    const seen = new Set([entry.id]);
    let step = parent;
    let valid = parent !== null && known.has(parent);
    while (valid && step !== null) {
      if (seen.has(step)) valid = false;
      seen.add(step);
      const next = declared.get(step) ?? null;
      step = next !== null && known.has(next) ? next : null;
    }
    parents.set(entry.id, valid ? parent : null);
  }
  const children = new Map<string, string[]>();
  for (const entry of scenes) {
    const parent = parents.get(entry.id) ?? null;
    if (parent !== null)
      children.set(parent, [...(children.get(parent) ?? []), entry.id]);
  }
  const childrenOf = (sceneId: string) => children.get(sceneId) ?? [];
  const descendantsOf = (sceneId: string): string[] =>
    childrenOf(sceneId).flatMap((child) => [child, ...descendantsOf(child)]);
  return {
    parentOf: (sceneId) => parents.get(sceneId) ?? null,
    childrenOf,
    descendantsOf,
  };
}

/**
 * The scenes shown at the top of a place: a session's scenes in order, except those shown
 * under one of their parents in the same session; or, for "unsorted", the top-level scenes in
 * no session. Sub-scenes then show under their parent wherever it shows.
 */
export function topScenes(
  hierarchy: SceneHierarchy,
  scenes: readonly SceneEntry[],
  sessions: readonly SessionEntry[],
  slot: SceneSlot,
): string[] {
  if (slot === "unsorted") {
    const planned = new Set(
      sessions.flatMap((entry) => entry.session?.sceneIds ?? []),
    );
    return scenes
      .map((entry) => entry.id)
      .filter((id) => !planned.has(id) && hierarchy.parentOf(id) === null);
  }
  const listed =
    sessions.find((entry) => entry.id === slot.sessionId)?.session?.sceneIds ??
    [];
  const inSession = new Set(listed);
  const hasListedAncestor = (id: string) => {
    for (
      let up = hierarchy.parentOf(id);
      up !== null;
      up = hierarchy.parentOf(up)
    )
      if (inSession.has(up)) return true;
    return false;
  };
  return listed.filter((id) => !hasListedAncestor(id));
}

/** Every place in the browser where `sceneId` shows: at the top or under a parent. */
export function scenePlaces(
  hierarchy: SceneHierarchy,
  scenes: readonly SceneEntry[],
  sessions: readonly SessionEntry[],
  sceneId: string,
): SceneSlot[] {
  const slots: SceneSlot[] = [
    ...sessions.flatMap((entry) =>
      entry.session ? [{ sessionId: entry.id }] : [],
    ),
    "unsorted" as const,
  ];
  const shownAt = (id: string, slot: SceneSlot): boolean => {
    if (topScenes(hierarchy, scenes, sessions, slot).includes(id)) return true;
    const parent = hierarchy.parentOf(id);
    return parent !== null && shownAt(parent, slot);
  };
  return slots.filter((slot) => shownAt(sceneId, slot));
}
