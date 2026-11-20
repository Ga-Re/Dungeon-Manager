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

/** Widths of the default layout's side columns, in CSS pixels. */
const DATA_WIDTH = 352;
const SIDE_WIDTH = 320;

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
  if (id === "data" && has("map"))
    return { referencePanel: "map", direction: "left" };
  if (id === "browser" && has("details"))
    return { referencePanel: "details", direction: "above" };
  if (id === "details" && has("browser"))
    return { referencePanel: "browser", direction: "below" };
  if ((id === "browser" || id === "details") && has("map"))
    return { referencePanel: "map", direction: "right" };
  if (id === "map" && has("data"))
    return { referencePanel: "data", direction: "right" };
  return undefined;
}

/** Shows `id` again where it belongs; `title` is its translated tab title. */
export function showPanel(api: DockviewApi, id: PanelId, title: string): void {
  if (api.getPanel(id)) return;
  const position = placeOf(api, id);
  api.addPanel({
    id,
    component: id,
    title,
    ...(position && { position }),
  });
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
  api.getPanel("data")?.group.api.setSize({ width: DATA_WIDTH });
  api.getPanel("browser")?.group.api.setSize({ width: SIDE_WIDTH });
}

/** The layout stored on this device, or `null` (none, unreadable or from another version). */
export function readLayout(storage: Storage | undefined): unknown {
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    if (!raw) return null;
    const stored: unknown = JSON.parse(raw);
    if (
      typeof stored !== "object" ||
      stored === null ||
      (stored as { version?: unknown }).version !== LAYOUT_VERSION
    )
      return null;
    return (stored as { layout?: unknown }).layout ?? null;
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
 * (device storage is an edge: anything dockview refuses counts as none). Panels the stored
 * layout does not name are hidden on purpose and stay hidden; unknown ones are dropped.
 */
export function restoreLayout(
  api: DockviewApi,
  stored: unknown,
  titles: Readonly<Record<PanelId, string>>,
): void {
  if (stored !== null) {
    try {
      api.fromJSON(stored as Parameters<DockviewApi["fromJSON"]>[0]);
      for (const panel of [...api.panels])
        if (!(PANELS as readonly string[]).includes(panel.id))
          panel.api.close();
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
