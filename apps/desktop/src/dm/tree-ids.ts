// Ids of the items in the campaign browser (T-158, T-160b). Entity ids are `[A-Za-z0-9_-]`
// (idSchema), so `:` and `/` separate the parts safely.

export const CAMPAIGN_NODE = "campaign";

/** Groups under the campaign; they never collide with the item ids below. */
export const GROUP = {
  settings: "group:settings",
  sessions: "group:sessions",
  unsorted: "group:unsorted",
  maps: "group:maps",
  players: "group:players",
  handouts: "group:handouts",
  notes: "group:notes",
  sessionNotes: "group:session-notes",
  sceneNotes: "group:scene-notes",
} as const;

/** Where a scene appears in the tree: a session, or "Ohne Session". */
export type SceneSlot = { readonly sessionId: string } | "unsorted";

const UNSORTED_KEY = "-";

/** A scene can appear in several sessions, so its tree id includes where it appears. */
export function sceneNodeId(slot: SceneSlot, sceneId: string): string {
  const key = slot === "unsorted" ? UNSORTED_KEY : slot.sessionId;
  return `scene:${key}/${sceneId}`;
}

export const sessionNodeId = (sessionId: string) => `session:${sessionId}`;
export const missingNodeId = (sessionId: string, sceneId: string) =>
  `missing:${sessionId}/${sceneId}`;
export const mapNodeId = (path: string) => `map:${path}`;
export const playerNodeId = (playerId: string) => `player:${playerId}`;
/** Whose note it is: the campaign, a session or a scene (T-161b). */
export type NoteOwnerRef =
  | { readonly kind: "campaign" }
  | { readonly kind: "session" | "scene"; readonly id: string };

const ownerKey = (owner: NoteOwnerRef) =>
  owner.kind === "campaign" ? "campaign" : `${owner.kind}.${owner.id}`;

/**
 * A note in the tree: its owner and its path relative to the campaign folder, since the same
 * file may be linked from several places.
 */
export const noteNodeId = (owner: NoteOwnerRef, path: string) =>
  `note:${ownerKey(owner)}:${path}`;

/** What a tree id stands for. */
export type TreeItem =
  | { readonly kind: "campaign" }
  | { readonly kind: "group"; readonly id: string }
  | {
      readonly kind: "scene";
      readonly slot: SceneSlot;
      readonly sceneId: string;
    }
  | { readonly kind: "session"; readonly sessionId: string }
  | { readonly kind: "map"; readonly path: string }
  | { readonly kind: "player"; readonly playerId: string }
  | {
      readonly kind: "note";
      readonly owner: NoteOwnerRef;
      readonly path: string;
    }
  /** A scene a session names but that does not exist (yet). */
  | {
      readonly kind: "missing";
      readonly sessionId: string;
      readonly sceneId: string;
    }
  /** Anything else: the open scene's content. */
  | { readonly kind: "other" };

export function parseTreeId(id: string): TreeItem {
  if (id === CAMPAIGN_NODE) return { kind: "campaign" };
  if (id.startsWith("group:")) return { kind: "group", id };
  const scene = /^scene:([^/]+)\/(.+)$/.exec(id);
  if (scene?.[1] !== undefined && scene[2] !== undefined)
    return {
      kind: "scene",
      slot: scene[1] === UNSORTED_KEY ? "unsorted" : { sessionId: scene[1] },
      sceneId: scene[2],
    };
  const missing = /^missing:([^/]+)\/(.+)$/.exec(id);
  if (missing?.[1] !== undefined && missing[2] !== undefined)
    return { kind: "missing", sessionId: missing[1], sceneId: missing[2] };
  if (id.startsWith("session:"))
    return { kind: "session", sessionId: id.slice("session:".length) };
  if (id.startsWith("map:"))
    return { kind: "map", path: id.slice("map:".length) };
  const note = /^note:(campaign|(session|scene)\.([A-Za-z0-9_-]+)):(.+)$/.exec(
    id,
  );
  if (note?.[4] !== undefined)
    return {
      kind: "note",
      owner:
        note[1] === "campaign"
          ? { kind: "campaign" }
          : {
              kind: note[2] === "session" ? "session" : "scene",
              id: note[3] ?? "",
            },
      path: note[4],
    };
  if (id.startsWith("player:"))
    return { kind: "player", playerId: id.slice("player:".length) };
  return { kind: "other" };
}
