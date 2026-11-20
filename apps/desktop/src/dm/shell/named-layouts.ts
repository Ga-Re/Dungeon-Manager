import type { Workspace } from "./workspace.js";
import { usableLayout } from "./panel-layout.js";

// Named layouts (T-172c, ADR-0017): the DM saves the panel layout under a name ("Kampf",
// "Erkundung") per workspace and switches between them. Stored per device, because screens
// differ, like the current layout.

/** A saved panel layout. */
export interface NamedLayout {
  readonly id: string;
  /** The DM's name for it; unique in its workspace, ignoring case. */
  readonly name: string;
  /** dockview's layout (`toJSON`). */
  readonly layout: unknown;
}

const STORAGE_KEY = "dm.layouts";
const VERSION = 1;

/** Longest name, in characters: it has to fit a menu entry. */
export const LAYOUT_NAME_MAX_LENGTH = 40;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function readAll(storage: Storage | undefined): Record<string, unknown> {
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    if (!raw) return {};
    const stored: unknown = JSON.parse(raw);
    // Another version (e.g. from a newer build) is dropped as a whole: these are device
    // preferences, and the next save starts over.
    if (!isRecord(stored) || stored["version"] !== VERSION) return {};
    const workspaces = stored["workspaces"];
    return isRecord(workspaces) ? workspaces : {};
  } catch {
    return {};
  }
}

/** The named layouts of `workspace` on this device; entries this app cannot use are dropped. */
export function readNamedLayouts(
  storage: Storage | undefined,
  workspace: Workspace,
): NamedLayout[] {
  const entries = readAll(storage)[workspace];
  if (!Array.isArray(entries)) return [];
  return entries.flatMap((entry: unknown): NamedLayout[] => {
    if (!isRecord(entry)) return [];
    const { id, name } = entry;
    const layout = usableLayout(entry["layout"]);
    return typeof id === "string" &&
      typeof name === "string" &&
      name.trim() !== "" &&
      layout
      ? [{ id, name, layout }]
      : [];
  });
}

/** Stores the named layouts of `workspace`; a storage that refuses them is ignored. */
export function writeNamedLayouts(
  storage: Storage | undefined,
  workspace: Workspace,
  layouts: readonly NamedLayout[],
): void {
  try {
    storage?.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: VERSION,
        workspaces: { ...readAll(storage), [workspace]: layouts },
      }),
    );
  } catch {
    // Not persisted; the layouts still apply until the window closes.
  }
}

const sameName = (first: string, second: string) =>
  first.trim().toLocaleLowerCase() === second.trim().toLocaleLowerCase();

/** Why `name` cannot be used (for the layout `id`, when renaming one), or `null`. */
export function layoutNameProblem(
  layouts: readonly NamedLayout[],
  name: string,
  id?: string,
): "empty" | "tooLong" | "taken" | null {
  const trimmed = name.trim();
  if (trimmed === "") return "empty";
  if (trimmed.length > LAYOUT_NAME_MAX_LENGTH) return "tooLong";
  // Saving (no id) under a taken name replaces that layout.
  if (
    id !== undefined &&
    layouts.some((each) => each.id !== id && sameName(each.name, name))
  )
    return "taken";
  return null;
}

/**
 * `layouts` with `layout` saved as `name`: it replaces the layout of that name (which keeps its
 * place and id), or is added at the end with `newId`.
 */
export function saveNamedLayout(
  layouts: readonly NamedLayout[],
  name: string,
  layout: unknown,
  newId: string,
): NamedLayout[] {
  const trimmed = name.trim();
  const index = layouts.findIndex((each) => sameName(each.name, trimmed));
  if (index === -1) return [...layouts, { id: newId, name: trimmed, layout }];
  return layouts.map((each, at) =>
    at === index ? { id: each.id, name: trimmed, layout } : each,
  );
}

/** `layouts` with the layout `id` named `name`. */
export function renameNamedLayout(
  layouts: readonly NamedLayout[],
  id: string,
  name: string,
): NamedLayout[] {
  return layouts.map((each) =>
    each.id === id ? { ...each, name: name.trim() } : each,
  );
}

/** `layouts` without the layout `id`. */
export function removeNamedLayout(
  layouts: readonly NamedLayout[],
  id: string,
): NamedLayout[] {
  return layouts.filter((each) => each.id !== id);
}
