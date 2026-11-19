import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from "react";

/** Where a {@link HudPanel} sits inside its area, and whether it is folded to its header. */
export interface HudPlacement {
  x: number;
  y: number;
  collapsed: boolean;
}

/** Props of {@link HudPanel}. */
export interface HudPanelProps {
  /** Translated title in the header bar; also names the region. */
  title: string;
  /** Translated names of the header controls. */
  labels: {
    /** The drag grip, e.g. "Browser verschieben (Pfeiltasten)". */
    move: string;
    collapse: string;
    expand: string;
  };
  placement: HudPlacement;
  onPlacementChange: (placement: HudPlacement) => void;
  /** Extra controls in the header, before the fold button. */
  headerActions?: ReactNode;
  className?: string | undefined;
  children: ReactNode;
}

/** Keyboard step of the grip; Shift moves further. */
const STEP = 16;
const BIG_STEP = 64;

/** Keeps the panel inside its positioned parent (the map area). */
function clamp(
  panel: HTMLElement,
  x: number,
  y: number,
): { x: number; y: number } {
  const area = panel.offsetParent;
  if (!(area instanceof HTMLElement))
    return { x: Math.max(0, Math.round(x)), y: Math.max(0, Math.round(y)) };
  const maxX = Math.max(0, area.clientWidth - panel.offsetWidth);
  const maxY = Math.max(0, area.clientHeight - panel.offsetHeight);
  return {
    x: Math.round(Math.min(Math.max(0, x), maxX)),
    y: Math.round(Math.min(Math.max(0, y), maxY)),
  };
}

/**
 * A tool window floating over the map (ADR-0011, ADR-0015), as in CAD tools: a small header bar
 * with a drag grip, the title and a fold button over a transparent body. It is dragged by its
 * grip (or moved with the arrow keys on the grip) within its positioned parent; the owner keeps
 * the placement (e.g. per device).
 */
export function HudPanel({
  title,
  labels,
  placement,
  onPlacementChange,
  headerActions,
  className,
  children,
}: HudPanelProps) {
  const headingId = useId();
  const bodyId = useId();
  const panel = useRef<HTMLElement>(null);
  const drag = useRef<{ dx: number; dy: number } | null>(null);
  // While dragging, the panel follows the pointer without telling the owner on every move.
  const [live, setLive] = useState<{ x: number; y: number } | null>(null);
  const shown = live ?? placement;

  const moveTo = useCallback(
    (x: number, y: number) => {
      const element = panel.current;
      const next = element ? clamp(element, x, y) : { x, y };
      onPlacementChange({ ...placement, ...next });
    },
    [onPlacementChange, placement],
  );

  // A smaller window (or a wider data panel) must not strand the panel outside the map area.
  useEffect(() => {
    const element = panel.current;
    const area = element?.offsetParent;
    if (!element || !(area instanceof HTMLElement)) return;
    const keepInside = () => {
      const inside = clamp(element, placement.x, placement.y);
      if (inside.x !== placement.x || inside.y !== placement.y)
        onPlacementChange({ ...placement, ...inside });
    };
    keepInside();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(keepInside);
    observer.observe(area);
    return () => {
      observer.disconnect();
    };
  }, [placement, onPlacementChange]);

  const onPointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = {
      dx: event.clientX - placement.x,
      dy: event.clientY - placement.y,
    };
  };
  const onPointerMove = (event: PointerEvent<HTMLButtonElement>) => {
    const start = drag.current;
    const element = panel.current;
    if (!start || !element) return;
    setLive(clamp(element, event.clientX - start.dx, event.clientY - start.dy));
  };
  const onPointerUp = () => {
    drag.current = null;
    if (live) moveTo(live.x, live.y);
    setLive(null);
  };

  const onGripKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const step = event.shiftKey ? BIG_STEP : STEP;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    const move = moves[event.key];
    if (!move) return;
    event.preventDefault();
    moveTo(placement.x + move[0], placement.y + move[1]);
  };

  return (
    <section
      ref={panel}
      aria-labelledby={headingId}
      className={["dm-hud", className ?? ""].filter(Boolean).join(" ")}
      style={{ left: shown.x, top: shown.y }}
    >
      <header className="dm-hud-head">
        <button
          type="button"
          className="dm-hud-grip"
          aria-label={labels.move}
          title={labels.move}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onKeyDown={onGripKeyDown}
        >
          <svg viewBox="0 0 8 12" aria-hidden="true">
            <circle cx="2" cy="2" r="1" />
            <circle cx="6" cy="2" r="1" />
            <circle cx="2" cy="6" r="1" />
            <circle cx="6" cy="6" r="1" />
            <circle cx="2" cy="10" r="1" />
            <circle cx="6" cy="10" r="1" />
          </svg>
        </button>
        <h2 id={headingId} className="dm-hud-title">
          {title}
        </h2>
        {headerActions}
        <button
          type="button"
          className="dm-hud-fold"
          aria-label={placement.collapsed ? labels.expand : labels.collapse}
          title={placement.collapsed ? labels.expand : labels.collapse}
          aria-expanded={!placement.collapsed}
          aria-controls={bodyId}
          onClick={() => {
            onPlacementChange({
              ...placement,
              collapsed: !placement.collapsed,
            });
          }}
        >
          <svg viewBox="0 0 10 10" aria-hidden="true">
            <path d="M2 5h6" />
            {placement.collapsed && <path d="M5 2v6" />}
          </svg>
        </button>
      </header>
      <div id={bodyId} className="dm-hud-body" hidden={placement.collapsed}>
        {children}
      </div>
    </section>
  );
}
