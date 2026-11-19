import { useEffect, useRef, type ReactNode, type RefObject } from "react";
import type { MenuPoint } from "./ContextMenu.js";

/** Props of {@link Popover}. */
export interface PopoverProps {
  /** Whether the popover is shown; it renders nothing while closed. */
  open: boolean;
  /** Called on Escape (from inside or from the anchor) and on a pointer press outside. */
  onClose: () => void;
  /** The control that opened it: presses on it do not count as outside, focus returns to it. */
  anchor: RefObject<HTMLElement | null>;
  /** Translated accessible name of the popover's content. */
  label: string;
  /** Which edge of the positioned parent the popover lines up with. */
  align?: "start" | "end" | undefined;
  /** Open at a viewport point instead (e.g. where a context menu was), ignoring `align`. */
  at?: MenuPoint | undefined;
  id?: string | undefined;
  className?: string | undefined;
  children: ReactNode;
}

/**
 * Small framed panel under a control, for settings and short forms (ADR-0011, layer 40). It is a
 * disclosure, not a modal: focus is not trapped, and Escape only closes it when focus is inside
 * it or on its anchor, so the map keeps its own Escape. Place it inside a positioned parent.
 */
export function Popover({
  open,
  onClose,
  anchor,
  label,
  align = "end",
  at,
  id,
  className,
  children,
}: PopoverProps) {
  const panel = useRef<HTMLDivElement>(null);
  // The latest callback without re-subscribing the listeners on every render.
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  });

  // Focus goes back to the anchor only once the owner really closed it (it may refuse, e.g.
  // while busy) – otherwise focus would leave a popover that is still open.
  const returnFocus = useRef(false);
  useEffect(() => {
    if (open || !returnFocus.current) return;
    returnFocus.current = false;
    anchor.current?.focus();
  }, [open, anchor]);

  useEffect(() => {
    if (!open) return;
    returnFocus.current = false;
    const within = (target: EventTarget | null) =>
      target instanceof Node &&
      (panel.current?.contains(target) === true ||
        anchor.current?.contains(target) === true);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || !within(event.target)) return;
      event.preventDefault();
      returnFocus.current = true;
      close.current();
    };
    const onPointerDown = (event: PointerEvent) => {
      if (!within(event.target)) close.current();
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("pointerdown", onPointerDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open, anchor]);

  if (!open) return null;
  return (
    <div
      ref={panel}
      id={id}
      role="group"
      aria-label={label}
      className={[
        "dm-popover",
        at ? "dm-popover-at" : `dm-popover-${align}`,
        className ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
      style={at && { left: at.x, top: at.y }}
    >
      {children}
    </div>
  );
}
