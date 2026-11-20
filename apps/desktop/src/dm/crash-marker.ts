// Whether the DM window's last session ended cleanly (T-114a): a marker in device storage is set
// when the window starts and removed when it closes. Still set at the next start, the app was
// killed or crashed – then the TV stays dark until the DM sends a scene (DM decision,
// 2026-11-20).

const STORAGE_KEY = "dm.sessionRunning";

/**
 * Marks the session as running. @returns whether the previous one never ended (a crash); `false`
 * when the storage cannot be read.
 */
export function startSession(storage: Storage | undefined): boolean {
  try {
    const crashed = storage?.getItem(STORAGE_KEY) === "1";
    storage?.setItem(STORAGE_KEY, "1");
    return crashed;
  } catch {
    return false;
  }
}

/** Marks the session as ended cleanly (the window closes). */
export function endSession(storage: Storage | undefined): void {
  try {
    storage?.removeItem(STORAGE_KEY);
  } catch {
    // Not stored: the next start counts as after a crash and keeps the TV dark – the safe side.
  }
}
