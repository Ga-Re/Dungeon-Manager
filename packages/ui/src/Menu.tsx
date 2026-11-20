import {
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
  type Ref,
} from "react";
import { MenuList, type MenuItem } from "./MenuList.js";

export type { MenuItem } from "./MenuList.js";

/** Props of {@link Menu}. */
export interface MenuProps {
  /** Translated text of the menu button; also its accessible name. */
  label: string;
  /**
   * Translated name of the open menu, where the button shows the current choice instead (the
   * workspace selector: "Arbeitsbereich" for a button saying "Game-Orchestrator"). `label` otherwise.
   */
  menuLabel?: string | undefined;
  items: readonly MenuItem[];
  /** Called with the chosen item's id; the menu has closed and focus is back on its button. */
  onSelect: (id: string) => void;
  /** The menu button, e.g. to return focus to it after a follow-up step. */
  buttonRef?: Ref<HTMLButtonElement> | undefined;
  /** The menu is opening, e.g. to close a popover of the same group first. */
  onOpen?: (() => void) | undefined;
  className?: string | undefined;
  /**
   * An icon instead of the text on the button (e.g. a panel's menu, T-172b); `label` stays its
   * accessible name and tooltip.
   */
  icon?: ReactNode;
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
  menuLabel,
  items,
  onSelect,
  buttonRef,
  onOpen,
  icon,
  className,
}: MenuProps) {
  const id = useId();
  const [open, setOpen] = useState<"first" | "last" | null>(null);
  const button = useRef<HTMLButtonElement | null>(null);

  const openAt = (where: "first" | "last") => {
    onOpen?.();
    setOpen(where);
  };

  const closeToButton = () => {
    setOpen(null);
    button.current?.focus();
  };

  const onButtonKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      openAt(event.key === "ArrowDown" ? "first" : "last");
    }
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
        aria-expanded={open !== null}
        aria-controls={open ? `${id}-menu` : undefined}
        onClick={() => {
          if (open) setOpen(null);
          else openAt("first");
        }}
        onKeyDown={onButtonKeyDown}
        {...(icon !== undefined && { "aria-label": label, title: label })}
      >
        {icon ?? label}
        {icon === undefined && (
          <svg className="dm-menu-chevron" viewBox="0 0 8 8" aria-hidden="true">
            <path d="M1.5 3l2.5 2.5 2.5-2.5" />
          </svg>
        )}
      </button>
      {open && (
        <MenuList
          id={`${id}-menu`}
          label={menuLabel ?? label}
          items={items}
          initial={open}
          owner={button}
          onChoose={(item) => {
            closeToButton();
            onSelect(item.id);
          }}
          onDismiss={(reason) => {
            // Tab and Escape leave from the button; a press outside keeps focus where it went.
            if (reason === "outside") setOpen(null);
            else closeToButton();
          }}
        />
      )}
    </span>
  );
}
