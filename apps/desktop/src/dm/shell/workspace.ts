// Workspaces of the DM window (T-156): each has its own ribbon tabs. Remembered per device in
// the webview's storage, like the theme.

/** The four workspaces (DM decision, 2026-11-19), in the selector's order. */
export const WORKSPACES = [
  "mapForge",
  "assetStudio",
  "campaignAtlas",
  "gameMode",
] as const;
export type Workspace = (typeof WORKSPACES)[number];

const STORAGE_KEY = "dm.workspace";

/** Where the first start opens: running a session needs today's tools. */
const DEFAULT_WORKSPACE: Workspace = "gameMode";

/** Whether `value` names one of the workspaces (e.g. a menu item's id). */
export function isWorkspace(value: unknown): value is Workspace {
  return WORKSPACES.includes(value as Workspace);
}

/** The workspace last used on this device; anything unreadable or unknown is Game Mode. */
export function readWorkspace(storage: Storage | undefined): Workspace {
  try {
    const value = storage?.getItem(STORAGE_KEY);
    return isWorkspace(value) ? value : DEFAULT_WORKSPACE;
  } catch {
    return DEFAULT_WORKSPACE;
  }
}

/** Remembers the workspace on this device; a storage that refuses it is ignored. */
export function saveWorkspace(
  storage: Storage | undefined,
  workspace: Workspace,
): void {
  try {
    storage?.setItem(STORAGE_KEY, workspace);
  } catch {
    // Not persisted; the workspace still applies until the window closes.
  }
}
