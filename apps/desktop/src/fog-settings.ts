// How the fog looks on this device (T-136a, T-136b): kept in the webview's storage like the
// theme, so no file format changes. The DM window and the player window share that storage,
// so the player window follows a change through the `storage` event.

const SOFT_EDGES_KEY = "dm.fog.softEdges";
const FADE_KEY = "dm.fog.fadeSeconds";

/**
 * Width of the soft fog edge as a share of a grid cell, from the hard edge inwards: soft, while
 * a revealed one-cell corridor or door stays open in its middle.
 */
export const SOFT_EDGE_CELLS = 0.25;

/** The fade duration's range in seconds (DM decision): 0 switches at once. */
export const FADE_MAX_SECONDS = 3;
export const FADE_STEP_SECONDS = 0.05;
const DEFAULT_FADE_SECONDS = 0.65;

/** The fog's look on this device. */
export interface FogLook {
  readonly softEdges: boolean;
  /** How long a fog change fades, 0 … 3 s. */
  readonly fadeSeconds: number;
}

/** Soft edges on unless switched off on this device (DM request: no hard edges). */
export function readSoftEdges(storage: Storage | undefined): boolean {
  try {
    return storage?.getItem(SOFT_EDGES_KEY) !== "off";
  } catch {
    return true;
  }
}

/** Remembers the choice on this device; a storage that refuses it is ignored. */
export function saveSoftEdges(storage: Storage | undefined, on: boolean): void {
  try {
    storage?.setItem(SOFT_EDGES_KEY, on ? "on" : "off");
  } catch {
    // Not persisted; the choice still applies until the window closes.
  }
}

/** A duration within 0 … 3 s on the slider's steps; anything else is the default. */
function fadeSecondsOf(value: string | null): number {
  if (value === null || value.trim() === "") return DEFAULT_FADE_SECONDS;
  const seconds = Number(value);
  if (!Number.isFinite(seconds)) return DEFAULT_FADE_SECONDS;
  const clamped = Math.min(FADE_MAX_SECONDS, Math.max(0, seconds));
  // Two decimals: 1.25, not 1.2500000000000002.
  return Number(
    (Math.round(clamped / FADE_STEP_SECONDS) * FADE_STEP_SECONDS).toFixed(2),
  );
}

/** The fade duration on this device in seconds (0.65 s unless chosen). */
export function readFadeSeconds(storage: Storage | undefined): number {
  try {
    return fadeSecondsOf(storage?.getItem(FADE_KEY) ?? null);
  } catch {
    return DEFAULT_FADE_SECONDS;
  }
}

/** Remembers the fade duration on this device; a storage that refuses it is ignored. */
export function saveFadeSeconds(
  storage: Storage | undefined,
  seconds: number,
): void {
  try {
    storage?.setItem(FADE_KEY, String(fadeSecondsOf(String(seconds))));
  } catch {
    // Not persisted; the duration still applies until the window closes.
  }
}

/** Both settings at once. */
export function readFogLook(storage: Storage | undefined): FogLook {
  return {
    softEdges: readSoftEdges(storage),
    fadeSeconds: readFadeSeconds(storage),
  };
}

/** The soft edge in map pixels for a map with `cellSizePx` cells; 0 draws hard edges. */
export function softEdgeWidth(cellSizePx: number, on: boolean): number {
  return on ? cellSizePx * SOFT_EDGE_CELLS : 0;
}

/**
 * Calls `listener` with the new look when another window of this app changes it (the browser
 * fires `storage` only in the other windows). Returns a function that stops listening.
 */
export function onFogLookChange(
  storage: Storage | undefined,
  listener: (look: FogLook) => void,
): () => void {
  const onStorage = (event: StorageEvent) => {
    if (event.key === SOFT_EDGES_KEY || event.key === FADE_KEY)
      listener(readFogLook(storage));
  };
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener("storage", onStorage);
  };
}
