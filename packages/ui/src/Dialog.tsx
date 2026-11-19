import {
  useEffect,
  useId,
  useRef,
  type ReactNode,
  type RefObject,
} from "react";

/** Props of {@link Dialog}. */
export interface DialogProps {
  open: boolean;
  /** Called on Escape, the close button and a press on the backdrop. */
  onClose: () => void;
  /** Translated title; also names the dialog. */
  title: string;
  /** Translated name of the close button. */
  closeLabel: string;
  /**
   * Gets focus back when the dialog closes (e.g. the button that opened it). Without it, the
   * element focused before opening does – but WebKit does not focus a clicked button.
   */
  returnFocus?: RefObject<HTMLElement | null> | undefined;
  className?: string | undefined;
  children: ReactNode;
}

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * The elements Tab stops at, in order: not those with a negative tabindex (e.g. inactive tabs
 * of a tab list), and of each radio group only the checked radio (the first one if none is).
 */
function tabStops(root: HTMLElement): HTMLElement[] {
  const all = [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
    (each) => each.tabIndex >= 0,
  );
  return all.filter((each) => {
    if (!(each instanceof HTMLInputElement) || each.type !== "radio")
      return true;
    if (!each.name) return true;
    const group = all.filter(
      (other): other is HTMLInputElement =>
        other instanceof HTMLInputElement &&
        other.type === "radio" &&
        other.name === each.name,
    );
    const stop = group.find((radio) => radio.checked) ?? group[0];
    return stop === each;
  });
}

/**
 * A modal dialog (ADR-0011, layer 50), e.g. the settings: a backdrop over the whole window and
 * a framed panel with a title bar. Focus moves into it, stays in it (Tab wraps) and goes back
 * to where it was when it closes; Escape closes it.
 */
export function Dialog({
  open,
  onClose,
  title,
  closeLabel,
  returnFocus,
  className,
  children,
}: DialogProps) {
  const titleId = useId();
  const panel = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  });

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement;
    const element = panel.current;
    // The first control, else the panel itself.
    (element?.querySelector<HTMLElement>(FOCUSABLE) ?? element)?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        close.current();
        return;
      }
      if (event.key !== "Tab" || !element) return;
      const focusable = tabStops(element);
      const first = focusable[0];
      const last = focusable.at(-1);
      if (!first || !last) {
        event.preventDefault();
        return;
      }
      const active = document.activeElement;
      if (event.shiftKey && (active === first || !element.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (
        !event.shiftKey &&
        (active === last || !element.contains(active))
      ) {
        event.preventDefault();
        first.focus();
      }
    };
    // Capture: the dialog's keys come first, before the window's shortcuts (e.g. undo).
    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      const target = returnFocus?.current ?? previous;
      if (target instanceof HTMLElement) target.focus();
    };
  }, [open, returnFocus]);

  if (!open) return null;
  return (
    <div
      className="dm-dialog-backdrop"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) close.current();
      }}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={["dm-dialog", className ?? ""].filter(Boolean).join(" ")}
      >
        <header className="dm-dialog-head">
          <h2 id={titleId} className="dm-dialog-title">
            {title}
          </h2>
          <button
            type="button"
            className="dm-dialog-close"
            aria-label={closeLabel}
            title={closeLabel}
            onClick={() => {
              close.current();
            }}
          >
            <svg viewBox="0 0 10 10" aria-hidden="true">
              <path d="M2 2l6 6M8 2l-6 6" />
            </svg>
          </button>
        </header>
        <div className="dm-dialog-body">{children}</div>
      </div>
    </div>
  );
}
