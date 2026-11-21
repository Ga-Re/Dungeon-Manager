import { invoke } from "@tauri-apps/api/core";

/**
 * Asks the desktop backend whether the previous session of the app was killed or crashed
 * (T-238): it keeps a marker file in the OS app-data directory from start to exit, so this also
 * works where the webview reports no end (closing the window, Cmd+Q).
 */
export function tauriPreviousSessionCrashed(): Promise<boolean> {
  return invoke<boolean>("session_previous_crashed");
}
