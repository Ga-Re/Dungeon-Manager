// Workspaces of the DM window (T-156, ADR-0017): each has its own ribbon tabs. Remembered per
// device in the webview's storage, like the theme.

/** The five workspaces (ADR-0017, DM decision 2026-11-20), in the selector's order. */
export const WORKSPACES = [
  "mapForge",
  "assetVault",
  "creatures",
  "campaignAtlas",
  "gameOrchestrator",
] as const;
export type Workspace = (typeof WORKSPACES)[number];

const STORAGE_KEY = "dm.workspace";

/** Ids remembered before T-171 renamed the workspaces. */
const RENAMED: ReadonlyMap<string, Workspace> = new Map([
  ["assetStudio", "assetVault"],
  ["gameMode", "gameOrchestrator"],
]);

/** Where the first start opens: running a session needs today's tools. */
const DEFAULT_WORKSPACE: Workspace = "gameOrchestrator";

/** Whether `value` names one of the workspaces (e.g. a menu item's id). */
export function isWorkspace(value: unknown): value is Workspace {
  return WORKSPACES.includes(value as Workspace);
}

/**
 * The workspace last used on this device, also under its name before T-171; anything unreadable
 * or unknown is the Game-Orchestrator.
 */
export function readWorkspace(storage: Storage | undefined): Workspace {
  try {
    const value = storage?.getItem(STORAGE_KEY);
    if (isWorkspace(value)) return value;
    return (value != null && RENAMED.get(value)) || DEFAULT_WORKSPACE;
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
