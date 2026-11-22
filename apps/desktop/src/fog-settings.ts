// How the fog looks on this device (T-136a, T-136b): kept in the webview's storage like the
// theme, so no file format changes. The DM window and the player window share that storage,
// so the player window follows a change through the `storage` event.

import type { LivingFog } from "@dungeon-manager/renderer";

const SOFT_EDGES_KEY = "dm.fog.softEdges";
const FADE_KEY = "dm.fog.fadeSeconds";
const QUALITY_KEY = "dm.fog.quality";
const EDGE_KEY = "dm.fog.edge";
const MOTION_KEY = "dm.fog.motion";
const KEYS = [SOFT_EDGES_KEY, FADE_KEY, QUALITY_KEY, EDGE_KEY, MOTION_KEY];

/**
 * Width of the soft fog edge as a share of a grid cell, from the hard edge inwards: soft, while
 * a revealed one-cell corridor or door stays open in its middle.
 */
export const SOFT_EDGE_CELLS = 0.25;

/** The fade duration's range in seconds (DM decision): 0 switches at once. */
export const FADE_MAX_SECONDS = 3;
export const FADE_STEP_SECONDS = 0.05;
const DEFAULT_FADE_SECONDS = 0.65;

/** How much the living fog (T-245) does on this device; "off" is the still fog of before. */
export const FOG_QUALITIES = ["high", "medium", "off"] as const;
export type FogQuality = (typeof FOG_QUALITIES)[number];

/** The living fog's sliders (ADR-0019): range, step and default. */
export const FOG_EDGE = { max: 2.5, step: 0.1, default: 1.2 } as const;
export const FOG_MOTION = { max: 3, step: 0.1, default: 1 } as const;
/** The drift with "reduce motion" on in the system and nothing chosen here. */
const REDUCED_MOTION = 0.2;

/** The fog's look on this device. */
export interface FogLook {
  readonly softEdges: boolean;
  /** How long a fog change fades, 0 … 3 s. */
  readonly fadeSeconds: number;
  readonly quality: FogQuality;
  /** Edge wobble of the living fog, 0 … 2.5. */
  readonly edge: number;
  /** Drift speed of the living fog, 0 … 3. */
  readonly motion: number;
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

/** The quality chosen on this device; "medium" unless chosen (DM decision, 2026-11-22). */
export function readFogQuality(storage: Storage | undefined): FogQuality {
  const value = readItem(storage, QUALITY_KEY);
  return FOG_QUALITIES.find((each) => each === value) ?? "medium";
}

export function saveFogQuality(
  storage: Storage | undefined,
  quality: FogQuality,
): void {
  saveItem(storage, QUALITY_KEY, quality);
}

/** A slider value within 0 … `max` on its steps, or `fallback` for anything else. */
function sliderValue(
  value: string | null,
  range: { readonly max: number; readonly step: number },
  fallback: number,
): number {
  if (value === null || value.trim() === "") return fallback;
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  const clamped = Math.min(range.max, Math.max(0, number));
  return Number((Math.round(clamped / range.step) * range.step).toFixed(2));
}

/** The edge wobble on this device (1.2 unless chosen). */
export function readFogEdge(storage: Storage | undefined): number {
  return sliderValue(readItem(storage, EDGE_KEY), FOG_EDGE, FOG_EDGE.default);
}

export function saveFogEdge(storage: Storage | undefined, edge: number): void {
  saveItem(
    storage,
    EDGE_KEY,
    String(sliderValue(String(edge), FOG_EDGE, FOG_EDGE.default)),
  );
}

/** The drift speed on this device: 1 unless chosen, low when the system asks for less motion. */
export function readFogMotion(
  storage: Storage | undefined,
  reducedMotion = prefersReducedMotion(),
): number {
  return sliderValue(
    readItem(storage, MOTION_KEY),
    FOG_MOTION,
    reducedMotion ? REDUCED_MOTION : FOG_MOTION.default,
  );
}

export function saveFogMotion(
  storage: Storage | undefined,
  motion: number,
): void {
  saveItem(
    storage,
    MOTION_KEY,
    String(sliderValue(String(motion), FOG_MOTION, FOG_MOTION.default)),
  );
}

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

function readItem(storage: Storage | undefined, key: string): string | null {
  try {
    return storage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function saveItem(
  storage: Storage | undefined,
  key: string,
  value: string,
): void {
  try {
    storage?.setItem(key, value);
  } catch {
    // Not persisted; the choice still applies until the window closes.
  }
}

/** All settings at once. */
export function readFogLook(storage: Storage | undefined): FogLook {
  return {
    softEdges: readSoftEdges(storage),
    fadeSeconds: readFadeSeconds(storage),
    quality: readFogQuality(storage),
    edge: readFogEdge(storage),
    motion: readFogMotion(storage),
  };
}

/** The living fog for a map with `cellSizePx` cells, or none with the quality "off". */
export function livingFog(
  look: FogLook,
  cellSizePx: number,
): LivingFog | undefined {
  if (look.quality === "off") return undefined;
  return {
    quality: look.quality,
    cellSizePx,
    edge: look.edge,
    motion: look.motion,
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
    if (event.key !== null && KEYS.includes(event.key))
      listener(readFogLook(storage));
  };
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener("storage", onStorage);
  };
}
