import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from "react";

/** Props of {@link CommandPanel}. */
export interface CommandPanelProps {
  /** Translated name of the command; also names the panel. */
  title: string;
  okLabel: string;
  cancelLabel: string;
  /** Translated name of the title bar's drag handle. */
  moveLabel: string;
  /** OK is not possible yet (e.g. nothing drawn); Enter does nothing then. */
  okDisabled?: boolean | undefined;
  onOk: () => void;
  onCancel: () => void;
  className?: string | undefined;
  children: ReactNode;
}

const FOCUSABLE =
  'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * The panel a ribbon tool opens for its options (ADR-0020, as in CAD programs): it floats above
 * all panels (ADR-0021), is not modal – the DM keeps working on the map – and is moved by its
 * title bar, never out of the window. OK
 * or Enter applies, Abbrechen or Escape discards. Focus moves into it when it opens and back to
 * where it was when it closes. The owner renders it while the command runs, one at a time.
 */
export function CommandPanel({
  title,
  okLabel,
  cancelLabel,
  moveLabel,
  okDisabled = false,
  onOk,
  onCancel,
  className,
  children,
}: CommandPanelProps) {
  const titleId = useId();
  const panel = useRef<HTMLDivElement>(null);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const drag = useRef<{
    readonly pointerId: number;
    readonly x: number;
    readonly y: number;
    readonly from: { readonly x: number; readonly y: number };
    /** How far it may move each way and stay in the window; none while it has no size. */
    readonly bounds: {
      readonly left: number;
      readonly right: number;
      readonly top: number;
      readonly bottom: number;
    } | null;
  } | null>(null);

  useEffect(() => {
    const previous = document.activeElement;
    panel.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
    return () => {
      // Back to the tool that opened it – only if the keyboard was in the panel (it closed
      // under it) and the tool is still there to be seen; never away from where the DM went.
      const now = document.activeElement;
      const lost = now === null || now === document.body;
      if (
        lost &&
        previous instanceof HTMLElement &&
        previous.isConnected &&
        !previous.closest("[hidden]")
      )
        previous.focus();
    };
  }, []);

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onCancel();
    } else if (
      event.key === "Enter" &&
      !(event.target instanceof HTMLButtonElement) &&
      !(event.target instanceof HTMLTextAreaElement)
    ) {
      // Buttons keep their own Enter; elsewhere Enter confirms, as OK does.
      event.preventDefault();
      if (!okDisabled) onOk();
    }
  };

  const onHandleDown = (event: PointerEvent) => {
    if (event.button !== 0) return;
    // Keeps the drag when the pointer leaves the handle (not every environment has it).
    const handle: Partial<Pick<Element, "setPointerCapture">> =
      event.currentTarget;
    handle.setPointerCapture?.(event.pointerId);
    const rect = panel.current?.getBoundingClientRect();
    drag.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      from: offset,
      // Where it would stand unmoved, so the drag keeps it in the window (T-257).
      bounds:
        rect && rect.width > 0
          ? {
              left: offset.x - rect.left,
              right: offset.x + window.innerWidth - rect.right,
              top: offset.y - rect.top,
              bottom: offset.y + window.innerHeight - rect.bottom,
            }
          : null,
    };
  };
  const onHandleMove = (event: PointerEvent) => {
    const start = drag.current;
    if (start?.pointerId !== event.pointerId) return;
    const x = start.from.x + event.clientX - start.x;
    const y = start.from.y + event.clientY - start.y;
    const { bounds } = start;
    setOffset(
      bounds
        ? {
            x: Math.min(Math.max(x, bounds.left), bounds.right),
            y: Math.min(Math.max(y, bounds.top), bounds.bottom),
          }
        : { x, y },
    );
  };
  const onHandleUp = (event: PointerEvent) => {
    if (drag.current?.pointerId === event.pointerId) drag.current = null;
  };

  return (
    <div
      ref={panel}
      role="dialog"
      aria-labelledby={titleId}
      className={["dm-command-panel", className ?? ""]
        .filter(Boolean)
        .join(" ")}
      style={{
        transform: `translate(${String(offset.x)}px, ${String(offset.y)}px)`,
      }}
      onKeyDown={onKeyDown}
    >
      <header className="dm-command-panel-head">
        {/* A pointer handle only: the panel's place does not matter to the keyboard. */}
        <span
          aria-hidden="true"
          title={moveLabel}
          className="dm-command-panel-handle"
          onPointerDown={onHandleDown}
          onPointerMove={onHandleMove}
          onPointerUp={onHandleUp}
          onPointerCancel={onHandleUp}
        >
          <svg viewBox="0 0 10 10" aria-hidden="true">
            <path d="M1 3h8M1 5h8M1 7h8" />
          </svg>
        </span>
        <h2 id={titleId} className="dm-command-panel-title">
          {title}
        </h2>
      </header>
      <div className="dm-command-panel-body">{children}</div>
      <footer className="dm-command-panel-actions">
        <button type="button" onClick={onCancel}>
          {cancelLabel}
        </button>
        <button
          type="button"
          className="dm-command-panel-ok"
          disabled={okDisabled}
          onClick={onOk}
        >
          {okLabel}
        </button>
      </footer>
    </div>
  );
}
