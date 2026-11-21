import type { DockviewApi, IDockviewGroupPanel } from "dockview-react";
import { useLayoutEffect, useRef } from "react";

// The panels of the DM window (T-172a, ADR-0017): dockview panels below the ribbon that the DM
// resizes, moves, docks and hides. Their layout is remembered per device in the webview's
// storage, like the theme.

/** The panels, in the View menu's order. */
export const PANELS = [
  "data",
  "map",
  "browser",
  "details",
  "initiative",
  "preview",
] as const;
export type PanelId = (typeof PANELS)[number];

const STORAGE_KEY = "dm.layout";
/** Bumped when stored layouts no longer fit the panels (they then fall back to the default). */
const LAYOUT_VERSION = 1;

/** Widths of the default layout's side columns in rem, so they follow the interface size. */
const DATA_WIDTH_REM = 22;
const SIDE_WIDTH_REM = 20;

function remToPixels(rem: number): number {
  const root = Number.parseFloat(
    getComputedStyle(document.documentElement).fontSize,
  );
  return Math.round(rem * (Number.isFinite(root) && root > 0 ? root : 14));
}

/**
 * Where a panel goes when it is shown again: next to the map, on the side of the default layout
 * (DM decision, 2026-11-20: Daten left, Browser over Eigenschaften on the right).
 */
function placeOf(
  api: DockviewApi,
  id: PanelId,
):
  | {
      readonly referencePanel: string;
      readonly direction: "left" | "right" | "above" | "below" | "within";
    }
  | undefined {
  const has = (other: PanelId) => api.getPanel(other) !== undefined;
  // Left to right as in the default layout: Daten, Karte, then Browser over Eigenschaften over
  // Initiative.
  const left = (["map", "browser", "details", "initiative"] as const).find(has);
  const right = (
    ["browser", "details", "initiative", "map", "data"] as const
  ).find(has);
  switch (id) {
    case "data":
      return left && { referencePanel: left, direction: "left" };
    case "map":
      if (has("data")) return { referencePanel: "data", direction: "right" };
      return right && { referencePanel: right, direction: "left" };
    case "browser":
      if (has("details"))
        return { referencePanel: "details", direction: "above" };
      if (has("map")) return { referencePanel: "map", direction: "right" };
      return has("data")
        ? { referencePanel: "data", direction: "right" }
        : undefined;
    case "details":
      if (has("browser"))
        return { referencePanel: "browser", direction: "below" };
      if (has("map")) return { referencePanel: "map", direction: "right" };
      return has("data")
        ? { referencePanel: "data", direction: "right" }
        : undefined;
    // T-113b: a tab next to Eigenschaften (DM decision 2026-11-21).
    case "preview":
      if (has("details"))
        return { referencePanel: "details", direction: "within" };
      if (has("browser"))
        return { referencePanel: "browser", direction: "below" };
      if (has("map")) return { referencePanel: "map", direction: "right" };
      return has("data")
        ? { referencePanel: "data", direction: "right" }
        : undefined;
    // T-111b: at the bottom of the right column.
    case "initiative":
      if (has("details"))
        return { referencePanel: "details", direction: "below" };
      if (has("browser"))
        return { referencePanel: "browser", direction: "below" };
      if (has("map")) return { referencePanel: "map", direction: "right" };
      return has("data")
        ? { referencePanel: "data", direction: "right" }
        : undefined;
  }
}

/** The width a side panel comes back with; the map takes what is left. */
const WIDTH_REM: Partial<Record<PanelId, number>> = {
  data: DATA_WIDTH_REM,
  browser: SIDE_WIDTH_REM,
  details: SIDE_WIDTH_REM,
  initiative: SIDE_WIDTH_REM,
  preview: SIDE_WIDTH_REM,
};

/**
 * Shows `id` again where it belongs; `title` is its translated tab title. A side panel docked
 * next to another one gets its default width instead of half of its neighbour (map first).
 */
export function showPanel(api: DockviewApi, id: PanelId, title: string): void {
  if (api.getPanel(id)) return;
  const position = placeOf(api, id);
  const panel = api.addPanel({
    id,
    component: id,
    title,
    ...(position && { position }),
  });
  const width = WIDTH_REM[id];
  if (
    width !== undefined &&
    (position?.direction === "left" || position?.direction === "right")
  )
    panel.group.api.setSize({ width: remToPixels(width) });
}

/**
 * Hides `id`. The other side columns keep their widths, so the room it frees goes to the map
 * (map first, ADR-0014) instead of being shared out evenly.
 */
export function hidePanel(api: DockviewApi, id: PanelId): void {
  const panel = api.getPanel(id);
  if (!panel) return;
  const restoreWidths = keepSideWidths(api, id);
  panel.api.close();
  restoreWidths();
}

/**
 * Remembers the widths of the side columns – every group but `id`'s and the map's – and returns
 * a function that gives them back after a change, so the map takes the room that changes.
 */
function keepSideWidths(api: DockviewApi, id: PanelId): () => void {
  const own = api.getPanel(id)?.group;
  const mapGroup = api.getPanel("map")?.group;
  const keep = api.groups
    .filter(
      (group) =>
        group !== own &&
        group !== mapGroup &&
        group.api.location.type === "grid",
    )
    .map((group) => [group, group.api.width] as const);
  return () => {
    for (const [group, width] of keep)
      if (api.groups.includes(group)) group.api.setSize({ width });
  };
}

/**
 * The default layout: Daten left, the map in the middle, Browser over Eigenschaften over
 * Initiative right.
 */
export function buildDefaultLayout(
  api: DockviewApi,
  titles: Readonly<Record<PanelId, string>>,
): void {
  api.clear();
  api.addPanel({ id: "map", component: "map", title: titles.map });
  api.addPanel({
    id: "data",
    component: "data",
    title: titles.data,
    position: { referencePanel: "map", direction: "left" },
  });
  api.addPanel({
    id: "browser",
    component: "browser",
    title: titles.browser,
    position: { referencePanel: "map", direction: "right" },
  });
  api.addPanel({
    id: "details",
    component: "details",
    title: titles.details,
    position: { referencePanel: "browser", direction: "below" },
  });
  api.addPanel({
    id: "initiative",
    component: "initiative",
    title: titles.initiative,
    position: { referencePanel: "details", direction: "below" },
  });
  // The TV preview as a tab next to Eigenschaften, which stays the one shown.
  api.addPanel({
    id: "preview",
    component: "preview",
    title: titles.preview,
    position: { referencePanel: "details", direction: "within" },
  });
  api.getPanel("details")?.api.setActive();
  api.getPanel("data")?.group.api.setSize({
    width: remToPixels(DATA_WIDTH_REM),
  });
  api.getPanel("browser")?.group.api.setSize({
    width: remToPixels(SIDE_WIDTH_REM),
  });
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * The layout stored on this device, or `null` (none, unreadable, from another version, or naming
 * panels this app does not have). Device storage is an edge: only our panels, each showing
 * its own component, and never a popout window (which would open a new window on start).
 */
export function readLayout(storage: Storage | undefined): unknown {
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    if (!raw) return null;
    const stored: unknown = JSON.parse(raw);
    if (!isRecord(stored) || stored["version"] !== LAYOUT_VERSION) return null;
    return usableLayout(stored["layout"]);
  } catch {
    return null;
  }
}

/**
 * `layout` (dockview's `toJSON`, read from device storage) if this app can use it, else `null`:
 * only our panels, each showing its own component, and without popout windows.
 */
export function usableLayout(layout: unknown): Record<string, unknown> | null {
  if (!isRecord(layout) || !isRecord(layout["panels"])) return null;
  const known = Object.entries(layout["panels"]).every(
    ([id, panel]) =>
      (PANELS as readonly string[]).includes(id) &&
      isRecord(panel) &&
      panel["contentComponent"] === id,
  );
  if (!known) return null;
  const rest = { ...layout };
  delete rest["popoutGroups"];
  return rest;
}

/** Remembers the layout on this device; a storage that refuses it is ignored. */
export function saveLayout(
  storage: Storage | undefined,
  layout: unknown,
): void {
  try {
    storage?.setItem(
      STORAGE_KEY,
      JSON.stringify({ version: LAYOUT_VERSION, layout }),
    );
  } catch {
    // Not persisted; the layout still applies until the window closes.
  }
}

/**
 * Restores the stored layout, or builds the default when there is none or it cannot be read
 * (anything dockview refuses counts as none). Panels the stored layout does not name were
 * hidden on purpose and stay hidden. Returns whether the stored layout was used.
 */
export function restoreLayout(
  api: DockviewApi,
  stored: unknown,
  titles: Readonly<Record<PanelId, string>>,
): boolean {
  if (stored !== null) {
    try {
      api.fromJSON(stored as Parameters<DockviewApi["fromJSON"]>[0]);
      // Titles follow the language, not the stored layout.
      for (const panel of api.panels)
        panel.api.setTitle(titles[panel.id as PanelId]);
      // dockview keeps a folded group's height but not that it may be that small.
      for (const id of foldedGroupIds(stored)) {
        const group = api.getGroup(id);
        if (group) fold(group, remToPixels(UNFOLD_HEIGHT_REM));
      }
      if (api.panels.length > 0) return true;
    } catch (error) {
      console.error("The stored panel layout cannot be used.", error);
    }
  }
  buildDefaultLayout(api, titles);
  return false;
}

/**
 * Puts a slot's stable element into a panel. The element is created once by the shell, so what
 * renders into it (through `ShellPortal`) keeps its state while the panel is hidden or moved.
 */
export function SlotHost({
  element,
  className,
}: {
  readonly element: HTMLElement;
  readonly className?: string;
}) {
  const container = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const parent = container.current;
    if (!parent) return;
    parent.appendChild(element);
    return () => {
      if (element.parentElement === parent) parent.removeChild(element);
    };
  }, [element]);
  return <div ref={container} className={className} />;
}

/** The window edges a panel can be docked to by command (T-172b). */
export type PanelEdge = "left" | "right" | "bottom";

/** Height of a panel docked at the bottom, in rem. */
const BOTTOM_HEIGHT_REM = 14;

/**
 * Docks `id` to an edge of the window (T-172b): the keyboard's way to do what dragging its tab
 * does. Its content stays alive (the slot host only moves).
 */
export function dockPanel(
  api: DockviewApi,
  id: PanelId,
  title: string,
  edge: PanelEdge,
): void {
  api.getPanel(id)?.api.close();
  const panel = api.addPanel({
    id,
    component: id,
    title,
    position: { direction: edge === "bottom" ? "below" : edge },
  });
  // The map is never squeezed to a side panel's width (map first, ADR-0014).
  if (id === "map") return;
  if (edge === "bottom")
    panel.group.api.setSize({ height: remToPixels(BOTTOM_HEIGHT_REM) });
  else
    panel.group.api.setSize({
      width: remToPixels(WIDTH_REM[id] ?? SIDE_WIDTH_REM),
    });
}

/** Lets `id` float over the others, e.g. the browser over the map (T-172b). */
export function floatPanel(api: DockviewApi, id: PanelId): void {
  const panel = api.getPanel(id);
  if (panel && panel.api.location.type !== "floating")
    api.addFloatingGroup(panel);
}

/** A group of the layout; folding works on groups (a panel's frame). */
type Group = IDockviewGroupPanel;

/** Heights of folded groups before they were folded, to unfold them again. */
const unfolded = new WeakMap<Group, number>();

/** Height of a group folded to its tab row, in rem (the tab row's height). */
const FOLDED_REM = 1.75;

/** Height a group folded in an earlier session unfolds to, in rem (its old height is lost). */
const UNFOLD_HEIGHT_REM = 14;

/** dockview's own minimum height of a group, restored when it unfolds. */
const UNFOLDED_MINIMUM_HEIGHT = 100;

function fold(group: Group, unfoldTo: number): void {
  unfolded.set(group, unfoldTo);
  // Groups keep a minimum height; a folded one may shrink to its tab row.
  const folded = remToPixels(FOLDED_REM);
  group.api.setConstraints({ minimumHeight: folded });
  group.api.setSize({ height: folded });
}

function unfold(group: Group): void {
  const before = unfolded.get(group);
  unfolded.delete(group);
  group.api.setConstraints({ minimumHeight: UNFOLDED_MINIMUM_HEIGHT });
  if (before !== undefined) group.api.setSize({ height: before });
}

/**
 * Ids of the groups a stored layout has folded: those in a column (sizes there are heights)
 * lower than an unfolded group may be. The stored layout is dockview's own (`toJSON`).
 */
export function foldedGroupIds(stored: unknown): string[] {
  if (!isRecord(stored) || !isRecord(stored["grid"])) return [];
  const grid = stored["grid"];
  const found: string[] = [];
  const visit = (node: unknown, column: boolean) => {
    if (!isRecord(node) || !Array.isArray(node["data"])) return;
    for (const child of node["data"] as unknown[]) {
      if (!isRecord(child)) continue;
      const data = child["data"];
      if (
        column &&
        child["type"] === "leaf" &&
        typeof child["size"] === "number" &&
        child["size"] < UNFOLDED_MINIMUM_HEIGHT &&
        isRecord(data) &&
        typeof data["id"] === "string"
      )
        found.push(data["id"]);
      // Branches alternate: a column's children are rows and the other way round.
      if (child["type"] === "branch") visit(child, !column);
    }
  };
  visit(grid["root"], grid["orientation"] === "VERTICAL");
  return found;
}

/**
 * Whether `id` can fold to its title: only a panel that shares its column with another one
 * (e.g. the browser over Eigenschaften) – the other one takes the room it frees.
 */
export function canFold(api: DockviewApi, id: PanelId): boolean {
  const panel = api.getPanel(id);
  return (
    panel !== undefined &&
    panel.api.location.type === "grid" &&
    panel.group.api.height < api.height - 1
  );
}

/** Whether `id` is folded to its title. */
export function isFolded(api: DockviewApi, id: PanelId): boolean {
  const group = api.getPanel(id)?.group;
  return group !== undefined && unfolded.has(group);
}

/**
 * Folds `id` to its title, or unfolds it to the height it had (T-172b). Returns whether it is
 * folded now, or `null` when nothing changed (it cannot fold where it is).
 */
export function toggleFold(api: DockviewApi, id: PanelId): boolean | null {
  const group = api.getPanel(id)?.group;
  if (!group) return null;
  if (unfolded.has(group)) {
    unfold(group);
    return false;
  }
  if (!canFold(api, id)) return null;
  fold(group, group.api.height);
  return true;
}

/**
 * Keeps folded groups folded after the layout changed: the window's resizing shares out height
 * (also to a folded group) and the interface size changes what a rem is. A group that no longer
 * shares a column (its neighbour was hidden) or floats unfolds. Returns whether one unfolded.
 */
export function settleFolds(api: DockviewApi): boolean {
  if (api.height <= 0) return false;
  const folded = remToPixels(FOLDED_REM);
  let changed = false;
  for (const group of api.groups) {
    if (!unfolded.has(group)) continue;
    if (
      group.api.location.type !== "grid" ||
      group.api.height >= api.height - 1
    ) {
      unfold(group);
      changed = true;
    } else if (Math.abs(group.api.height - folded) >= 1) {
      group.api.setConstraints({ minimumHeight: folded });
      group.api.setSize({ height: folded });
    }
  }
  return changed;
}
