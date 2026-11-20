import type { DockviewApi } from "dockview-react";
import { useLayoutEffect, useRef } from "react";

// The panels of the DM window (T-172a, ADR-0017): dockview panels below the ribbon that the DM
// resizes, moves, docks and hides. Their layout is remembered per device in the webview's
// storage, like the theme.

/** The panels, in the View menu's order. */
export const PANELS = ["data", "map", "browser", "details"] as const;
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
      readonly direction: "left" | "right" | "above" | "below";
    }
  | undefined {
  const has = (other: PanelId) => api.getPanel(other) !== undefined;
  // Left to right as in the default layout: Daten, Karte, then Browser over Eigenschaften.
  const left = (["map", "browser", "details"] as const).find(has);
  const right = (["browser", "details", "map", "data"] as const).find(has);
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
  }
}

/** The width a side panel comes back with; the map takes what is left. */
const WIDTH_REM: Partial<Record<PanelId, number>> = {
  data: DATA_WIDTH_REM,
  browser: SIDE_WIDTH_REM,
  details: SIDE_WIDTH_REM,
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
  const mapGroup = api.getPanel("map")?.group;
  const keep = api.groups
    .filter((group) => group !== panel.group && group !== mapGroup)
    .map((group) => [group, group.api.width] as const);
  panel.api.close();
  for (const [group, width] of keep)
    if (api.groups.includes(group)) group.api.setSize({ width });
}

/** The default layout: Daten left, the map in the middle, Browser over Eigenschaften right. */
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
 * panels this app does not have). Device storage is an edge: only our four panels, each showing
 * its own component, and never a popout window (which would open a new window on start).
 */
export function readLayout(storage: Storage | undefined): unknown {
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    if (!raw) return null;
    const stored: unknown = JSON.parse(raw);
    if (!isRecord(stored) || stored["version"] !== LAYOUT_VERSION) return null;
    const layout = stored["layout"];
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
  } catch {
    return null;
  }
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
 * hidden on purpose and stay hidden.
 */
export function restoreLayout(
  api: DockviewApi,
  stored: unknown,
  titles: Readonly<Record<PanelId, string>>,
): void {
  if (stored !== null) {
    try {
      api.fromJSON(stored as Parameters<DockviewApi["fromJSON"]>[0]);
      // Titles follow the language, not the stored layout.
      for (const panel of api.panels)
        panel.api.setTitle(titles[panel.id as PanelId]);
      if (api.panels.length > 0) return;
    } catch (error) {
      console.error("The stored panel layout cannot be used.", error);
    }
  }
  buildDefaultLayout(api, titles);
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
