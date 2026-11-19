import { useEffect, useRef, type ReactNode, type RefObject } from "react";

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

  useEffect(() => {
    if (!open) return;
    const within = (target: EventTarget | null) =>
      target instanceof Node &&
      (panel.current?.contains(target) === true ||
        anchor.current?.contains(target) === true);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || !within(event.target)) return;
      event.preventDefault();
      close.current();
      anchor.current?.focus();
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
      className={["dm-popover", `dm-popover-${align}`, className ?? ""]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </div>
  );
}
