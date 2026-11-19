import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
  type Ref,
} from "react";

/** One command of a {@link Menu}. */
export interface MenuItem {
  id: string;
  /** Translated, user-visible name of the command. */
  label: string;
  /** Decorative icon in front of the label. */
  icon?: ReactNode;
  disabled?: boolean | undefined;
}

/** Props of {@link Menu}. */
export interface MenuProps {
  /** Translated text of the menu button; also its accessible name. */
  label: string;
  items: readonly MenuItem[];
  /** Called with the chosen item's id; the menu has closed and focus is back on its button. */
  onSelect: (id: string) => void;
  /** The menu button, e.g. to return focus to it after a follow-up step. */
  buttonRef?: Ref<HTMLButtonElement> | undefined;
  className?: string | undefined;
}

/** Sets a ref of either kind (callback or object). */
function assignRef<T>(ref: Ref<T> | undefined, value: T | null) {
  if (typeof ref === "function") ref(value);
  else if (ref) ref.current = value;
}

/**
 * Menu button with a dropdown of commands, e.g. a ribbon group caption "Szene ▾" (ADR-0011).
 * Keyboard support follows the WAI-ARIA menu button pattern: Enter, Space or ArrowDown opens it
 * on the first item, ArrowUp on the last; arrows, Home and End move; Escape closes; Tab leaves.
 */
export function Menu({
  label,
  items,
  onSelect,
  buttonRef,
  className,
}: MenuProps) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement | null>(null);
  const menu = useRef<HTMLDivElement>(null);
  const entries = useRef<(HTMLButtonElement | null)[]>([]);
  // Which item gets focus once the menu has rendered.
  const [initial, setInitial] = useState<"first" | "last">("first");

  useEffect(() => {
    if (!open) return;
    const list = entries.current;
    (initial === "first" ? list[0] : list.at(-1))?.focus();
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (
        target instanceof Node &&
        !menu.current?.contains(target) &&
        !button.current?.contains(target)
      )
        setOpen(false);
    };
    window.addEventListener("pointerdown", onPointerDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open, initial]);

  const openAt = (where: "first" | "last") => {
    setInitial(where);
    setOpen(true);
  };

  const closeToButton = () => {
    setOpen(false);
    button.current?.focus();
  };

  const onButtonKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      openAt(event.key === "ArrowDown" ? "first" : "last");
    }
  };

  const onMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const list = entries.current.filter(
      (entry): entry is HTMLButtonElement => entry !== null,
    );
    const index = list.findIndex(
      (entry) => entry === entry.ownerDocument.activeElement,
    );
    const focus = (next: number) => {
      list[(next + list.length) % list.length]?.focus();
    };
    switch (event.key) {
      case "ArrowDown":
        focus(index + 1);
        break;
      case "ArrowUp":
        focus(index - 1);
        break;
      case "Home":
        focus(0);
        break;
      case "End":
        focus(list.length - 1);
        break;
      case "Escape":
        closeToButton();
        break;
      case "Tab":
        // Focus moves on to the next control as usual; the menu just closes.
        setOpen(false);
        return;
      default:
        return;
    }
    event.preventDefault();
  };

  const choose = (item: MenuItem) => {
    if (item.disabled) return;
    closeToButton();
    onSelect(item.id);
  };

  return (
    <span className={["dm-menu", className ?? ""].filter(Boolean).join(" ")}>
      <button
        ref={(element) => {
          button.current = element;
          assignRef(buttonRef, element);
        }}
        type="button"
        className="dm-menu-button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? `${id}-menu` : undefined}
        onClick={() => {
          if (open) setOpen(false);
          else openAt("first");
        }}
        onKeyDown={onButtonKeyDown}
      >
        {label}
        <svg className="dm-menu-chevron" viewBox="0 0 8 8" aria-hidden="true">
          <path d="M1.5 3l2.5 2.5 2.5-2.5" />
        </svg>
      </button>
      {open && (
        <div
          ref={menu}
          id={`${id}-menu`}
          role="menu"
          aria-label={label}
          className="dm-menu-list"
          onKeyDown={onMenuKeyDown}
        >
          {items.map((item, index) => (
            <button
              key={item.id}
              ref={(element) => {
                entries.current[index] = element;
              }}
              type="button"
              role="menuitem"
              tabIndex={-1}
              aria-disabled={item.disabled === true ? true : undefined}
              className="dm-menu-item"
              onClick={() => {
                choose(item);
              }}
            >
              {item.icon !== undefined && (
                <span className="dm-menu-item-icon" aria-hidden="true">
                  {item.icon}
                </span>
              )}
              {item.label}
            </button>
          ))}
        </div>
      )}
    </span>
  );
}
