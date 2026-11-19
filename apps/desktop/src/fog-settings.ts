// How the fog looks on this device (T-136a): kept in the webview's storage like the theme, so
// no file format changes. The DM window and the player window share that storage, so the
// player window follows a change through the `storage` event.

const SOFT_EDGES_KEY = "dm.fog.softEdges";

/** Width of the soft fog edge as a share of a grid cell: soft, but walls stay readable. */
export const SOFT_EDGE_CELLS = 0.4;

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

/** The soft edge in map pixels for a map with `cellSizePx` cells; 0 draws hard edges. */
export function softEdgeWidth(cellSizePx: number, on: boolean): number {
  return on ? cellSizePx * SOFT_EDGE_CELLS : 0;
}

/**
 * Calls `listener` when another window of this app changes the setting (the browser fires
 * `storage` only in the other windows). Returns a function that stops listening.
 */
export function onSoftEdgesChange(listener: (on: boolean) => void): () => void {
  const onStorage = (event: StorageEvent) => {
    if (event.key === SOFT_EDGES_KEY) listener(event.newValue !== "off");
  };
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener("storage", onStorage);
  };
}
