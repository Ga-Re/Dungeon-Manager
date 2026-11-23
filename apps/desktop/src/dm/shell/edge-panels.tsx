import { IconButton } from "@dungeon-manager/ui";
import { Pin } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { PANELS, type PanelId } from "./panel-layout.js";

// Edge sidebars (T-259, ADR-0021): a panel folded to an edge of the work area shows as a
// vertical tab; a click slides it out over the canvas, Escape or a press elsewhere slides it
// back, and its pin docks it again. Built on our own (dockview's auto-hide is a paid module).
// Which panels sit in which sidebar is remembered per device, like the layout.

export type Edge = "left" | "right";
export type EdgePanels = Readonly<Record<Edge, readonly PanelId[]>>;

export const NO_EDGE_PANELS: EdgePanels = { left: [], right: [] };

const STORAGE_KEY = "dm.edgePanels";

/** The map is the canvas or a panel of the layout, never in a sidebar. */
const canSlide = (id: string): id is PanelId =>
  id !== "map" && (PANELS as readonly string[]).includes(id);

/**
 * The sidebars stored on this device; device storage is an edge, so only known panels, each
 * once, never the map.
 */
export function readEdgePanels(storage: Storage | undefined): EdgePanels {
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    if (!raw) return NO_EDGE_PANELS;
    const stored: unknown = JSON.parse(raw);
    if (typeof stored !== "object" || stored === null) return NO_EDGE_PANELS;
    const seen = new Set<string>();
    const side = (value: unknown): PanelId[] =>
      Array.isArray(value)
        ? value.filter((id): id is PanelId => {
            if (typeof id !== "string" || !canSlide(id) || seen.has(id))
              return false;
            seen.add(id);
            return true;
          })
        : [];
    const record = stored as Record<string, unknown>;
    return { left: side(record["left"]), right: side(record["right"]) };
  } catch {
    return NO_EDGE_PANELS;
  }
}

/** Remembers the sidebars on this device; a storage that refuses them is ignored. */
export function saveEdgePanels(
  storage: Storage | undefined,
  edges: EdgePanels,
): void {
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify(edges));
  } catch {
    // Not persisted; the sidebars still apply until the window closes.
  }
}

/** `id` added to `edge` (and out of the other one). */
export function withEdgePanel(
  edges: EdgePanels,
  edge: Edge,
  id: PanelId,
): EdgePanels {
  const without = withoutEdgePanel(edges, id);
  return { ...without, [edge]: [...without[edge], id] };
}

/** `id` out of every sidebar. */
export function withoutEdgePanel(edges: EdgePanels, id: PanelId): EdgePanels {
  return {
    left: edges.left.filter((each) => each !== id),
    right: edges.right.filter((each) => each !== id),
  };
}

/** The sidebar `id` sits in, if any. */
export function edgeOf(edges: EdgePanels, id: PanelId): Edge | undefined {
  if (edges.left.includes(id)) return "left";
  if (edges.right.includes(id)) return "right";
  return undefined;
}

/** A sidebar's vertical tabs; the open one is expanded. */
export function EdgeBar({
  edge,
  ids,
  open,
  titles,
  onToggle,
  tabRef,
}: {
  readonly edge: Edge;
  readonly ids: readonly PanelId[];
  readonly open: PanelId | null;
  readonly titles: Readonly<Record<PanelId, string>>;
  readonly onToggle: (id: PanelId) => void;
  /** Collects the tabs, so focus can go back to one. */
  readonly tabRef: (id: PanelId, element: HTMLButtonElement | null) => void;
}) {
  const { t } = useTranslation();
  if (ids.length === 0) return null;
  return (
    <div
      role="toolbar"
      aria-orientation="vertical"
      aria-label={t(`shell.edges.${edge}`)}
      className="dm-edge-bar"
      data-edge={edge}
    >
      {ids.map((id) => (
        <button
          key={id}
          ref={(element) => {
            tabRef(id, element);
          }}
          type="button"
          className="dm-edge-tab"
          aria-expanded={open === id}
          aria-controls={`dm-edge-sheet-${edge}`}
          onClick={() => {
            onToggle(id);
          }}
        >
          {titles[id]}
        </button>
      ))}
    </div>
  );
}

/**
 * The panel slid out of a sidebar, over the canvas. It stays in the document while closed so it
 * slides back smoothly; closed, it is inert and invisible. `shown` is the panel on it (kept
 * while it slides back).
 */
export function EdgeSheet({
  edge,
  shown,
  open,
  title,
  onClose,
  onPin,
  children,
}: {
  readonly edge: Edge;
  readonly shown: PanelId | null;
  readonly open: boolean;
  readonly title: string;
  /** Slide back; `toTab` when the keyboard should go back to the panel's tab. */
  readonly onClose: (toTab: boolean) => void;
  readonly onPin: () => void;
  readonly children: ReactNode;
}) {
  const { t } = useTranslation();
  const sheet = useRef<HTMLElement>(null);
  // A press anywhere but on the sheet or a sidebar tab slides it back.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (sheet.current?.contains(target)) return;
      if (target instanceof Element && target.closest(".dm-edge-tab")) return;
      onClose(false);
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
    };
  }, [open, onClose]);
  return (
    <aside
      ref={sheet}
      id={`dm-edge-sheet-${edge}`}
      className="dm-edge-sheet"
      data-edge={edge}
      data-open={open ? "true" : undefined}
      aria-label={title}
      inert={!open}
      onKeyDown={(event) => {
        if (event.key !== "Escape") return;
        event.preventDefault();
        event.stopPropagation();
        onClose(true);
      }}
    >
      {shown !== null && (
        <>
          <header className="dm-edge-sheet-head">
            <span className="dm-edge-sheet-title">{title}</span>
            <IconButton
              icon={<Pin />}
              label={t("shell.edges.pin", { title })}
              onClick={onPin}
            />
          </header>
          <div className="dm-edge-sheet-body">{children}</div>
        </>
      )}
    </aside>
  );
}
