import { sceneSchema, type Scene } from "@dungeon-manager/schema";
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

const isFor = (copy: RescueCopy, ref: RescueRef) =>
  copy.root === ref.root &&
  copy.slug === ref.slug &&
  copy.scene.id === ref.sceneId;

/**
 * The kept copies; entries this app cannot use are skipped. Device storage is an edge: each
 * scene is validated like a scene file.
 */
export function readRescues(storage: Storage | undefined): RescueCopy[] {
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    if (!raw) return [];
    const stored: unknown = JSON.parse(raw);
    if (!isRecord(stored) || stored["version"] !== VERSION) return [];
    const copies = stored["copies"];
    if (!Array.isArray(copies)) return [];
    return copies.flatMap((entry: unknown): RescueCopy[] => {
      if (!isRecord(entry)) return [];
      const { root, slug, savedAt } = entry;
      const scene = sceneSchema.safeParse(entry["scene"]);
      return typeof root === "string" &&
        typeof slug === "string" &&
        typeof savedAt === "string" &&
        scene.success
        ? [{ root, slug, savedAt, scene: scene.data }]
        : [];
    });
  } catch {
    return [];
  }
}

function write(
  storage: Storage | undefined,
  copies: readonly RescueCopy[],
): void {
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify({ version: VERSION, copies }));
  } catch {
    // Not kept: the title bar still says the scene is not saved.
  }
}

/** Keeps `copy`, replacing an older one of the same scene. */
export function keepRescue(
  storage: Storage | undefined,
  copy: RescueCopy,
): void {
  const ref = { root: copy.root, slug: copy.slug, sceneId: copy.scene.id };
  const copies = readRescues(storage);
  const index = copies.findIndex((each) => isFor(each, ref));
  write(
    storage,
    index === -1
      ? [...copies, copy]
      : copies.map((each, at) => (at === index ? copy : each)),
  );
}

/** Drops the copy of a scene (it was saved, restored or discarded). */
export function dropRescue(storage: Storage | undefined, ref: RescueRef): void {
  const copies = readRescues(storage);
  const rest = copies.filter((each) => !isFor(each, ref));
  if (rest.length !== copies.length) write(storage, rest);
}

/**
 * What an open scene does with its saves (T-114b): keep a copy when one fails, drop it when one
 * succeeds. Provided by the library panel (it knows the library folder); absent in tests.
 */
export interface SceneRescue {
  keep(slug: string, scene: Scene): void;
  drop(slug: string, sceneId: string): void;
}

export const SceneRescueContext = createContext<SceneRescue | null>(null);
