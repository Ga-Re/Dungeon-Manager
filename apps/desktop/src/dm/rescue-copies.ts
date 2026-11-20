import {
  migrateDocument,
  sceneDocument,
  type Scene,
} from "@dungeon-manager/schema";
import { createContext } from "react";

// Rescue copies (T-114b, DM decision 2026-11-20): when saving a scene fails (e.g. the cloud
// folder is unreachable), its state is kept on this device – in the webview's storage in the
// app's data folder, never in the synced library – and offered on the next start. One copy per
// scene: the latest state that could not be saved. A later successful save drops it.

/** A scene that could not be saved, and where it belongs. */
export interface RescueCopy {
  /** The library folder. */
  readonly root: string;
  /** The campaign. */
  readonly slug: string;
  readonly scene: Scene;
  /** When it was kept (ISO 8601). */
  readonly savedAt: string;
}

/** Which scene's copy. */
export interface RescueRef {
  readonly root: string;
  readonly slug: string;
  readonly sceneId: string;
}

const STORAGE_KEY = "dm.rescueCopies";
const VERSION = 1;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Whether a stored entry (as it is, maybe unreadable now) is the copy of `ref`'s scene. */
const isFor = (entry: unknown, ref: RescueRef) =>
  isRecord(entry) &&
  entry["root"] === ref.root &&
  entry["slug"] === ref.slug &&
  isRecord(entry["scene"]) &&
  entry["scene"]["id"] === ref.sceneId;

/** The stored entries as they are: writing keeps those this app cannot read (e.g. newer ones). */
function readEntries(storage: Storage | undefined): unknown[] {
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    if (!raw) return [];
    const stored: unknown = JSON.parse(raw);
    if (!isRecord(stored) || stored["version"] !== VERSION) return [];
    const copies = stored["copies"];
    return Array.isArray(copies) ? copies : [];
  } catch {
    return [];
  }
}

/**
 * The kept copies this app can use. Device storage is an edge: each scene is read like a scene
 * file – migrated from an older version (a copy kept before an update stays usable), then
 * validated; anything else is skipped (and kept as it is).
 */
export function readRescues(storage: Storage | undefined): RescueCopy[] {
  return readEntries(storage).flatMap((entry: unknown): RescueCopy[] => {
    if (!isRecord(entry)) return [];
    const { root, slug, savedAt } = entry;
    if (
      typeof root !== "string" ||
      typeof slug !== "string" ||
      typeof savedAt !== "string"
    )
      return [];
    try {
      const scene = migrateDocument(entry["scene"], sceneDocument);
      return [{ root, slug, savedAt, scene }];
    } catch {
      return [];
    }
  });
}

function write(
  storage: Storage | undefined,
  entries: readonly unknown[],
): void {
  try {
    storage?.setItem(
      STORAGE_KEY,
      JSON.stringify({ version: VERSION, copies: entries }),
    );
  } catch (error) {
    // Not kept (e.g. the storage is full): the title bar still says the scene is not saved.
    console.error("The rescue copy could not be kept.", error);
  }
}

/** Keeps `copy`, replacing an older one of the same scene. */
export function keepRescue(
  storage: Storage | undefined,
  copy: RescueCopy,
): void {
  const ref = { root: copy.root, slug: copy.slug, sceneId: copy.scene.id };
  const entries = readEntries(storage);
  const index = entries.findIndex((each) => isFor(each, ref));
  write(
    storage,
    index === -1
      ? [...entries, copy]
      : entries.map((each, at) => (at === index ? copy : each)),
  );
}

/**
 * Drops the copy of a scene (saved again, restored, discarded or deleted). @returns whether
 * there was one
 */
export function dropRescue(
  storage: Storage | undefined,
  ref: RescueRef,
): boolean {
  const entries = readEntries(storage);
  const rest = entries.filter((each) => !isFor(each, ref));
  if (rest.length === entries.length) return false;
  write(storage, rest);
  return true;
}

/**
 * What an open scene does with its saves (T-114b): keep a copy when one fails, drop that copy
 * when a later save of the same session succeeds. A copy from an earlier session is only
 * dropped by the DM (restore, discard) or by deleting the scene: the scene opened from disk
 * is older than it. Provided by the library panel (it knows the library folder).
 */
export interface SceneRescue {
  keep(slug: string, scene: Scene): void;
  drop(slug: string, sceneId: string): void;
}

export const SceneRescueContext = createContext<SceneRescue | null>(null);
