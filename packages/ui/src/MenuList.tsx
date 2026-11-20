import {
  useEffect,
  useRef,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from "react";
import {
  useAnchoredPoint,
  useClampedPoint,
  type MenuPoint,
} from "./viewport.js";

/** One command of a {@link Menu} or {@link ContextMenu}. */
export interface MenuItem {
  id: string;
  /** Translated, user-visible name of the command. */
  label: string;
  /** Decorative icon in front of the label. */
  icon?: ReactNode;
  /**
   * One of a set of choices (T-164): `true` for the current one. Such items are announced as
   * radio items with their state and show a check mark. Every item of the set passes `true` or
   * `false`; leaving it out makes a plain command.
   */
  checked?: boolean | undefined;
  /**
   * An on/off setting rather than one of a set (T-172a, e.g. a panel shown or hidden): announced
   * as a checkbox item with `checked` as its state.
   */
  toggle?: boolean | undefined;
  disabled?: boolean | undefined;
}

/** Why a menu list wants to close without a choice. */
export type MenuDismissal = "escape" | "tab" | "outside";

/** Props of {@link MenuList}. */
export interface MenuListProps {
  id?: string | undefined;
  /** Translated accessible name of the menu. */
  label: string;
  items: readonly MenuItem[];
  /** Which item has focus when the list appears. */
  initial: "first" | "last";
  /** An enabled item was chosen. */
  onChoose: (item: MenuItem) => void;
  onDismiss: (reason: MenuDismissal) => void;
  /** Presses on this element (e.g. the menu button) do not count as outside. */
  owner?: RefObject<HTMLElement | null> | undefined;
  /**
   * Open at a viewport point (a context menu); without one it opens under `owner` (a menu
   * button). Either way fixed and kept inside the window.
   */
  at?: MenuPoint | undefined;
}

/**
 * The open list of a menu (WAI-ARIA menu pattern): focus moves into it, arrows (wrapping), Home
 * and End move, Escape and Tab dismiss, a press outside dismisses. Shared by {@link Menu} and
 * {@link ContextMenu}; render it only while open.
 */
export function MenuList({
  id,
  label,
  items,
  initial,
  onChoose,
  onDismiss,
  owner,
  at,
}: MenuListProps) {
  const menu = useRef<HTMLDivElement>(null);
  const atPoint = useClampedPoint(menu, at);
  const anchored = useAnchoredPoint(
    owner ?? menu,
    menu,
    "start",
    at === undefined && owner !== undefined,
  );
  const point = at ? (atPoint ?? at) : anchored;
  const entries = useRef<(HTMLButtonElement | null)[]>([]);
  const dismiss = useRef(onDismiss);
  useEffect(() => {
    dismiss.current = onDismiss;
  });

  const focusableEntries = () =>
    entries.current.filter(
      (entry): entry is HTMLButtonElement => entry !== null,
    );

  useEffect(() => {
    const list = focusableEntries();
    (initial === "first" ? list[0] : list.at(-1))?.focus();
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (
        target instanceof Node &&
        !menu.current?.contains(target) &&
        !owner?.current?.contains(target)
      )
        dismiss.current("outside");
    };
    window.addEventListener("pointerdown", onPointerDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
    };
    // Only when the list appears: initial focus must not jump on later renders.
  }, []);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const list = focusableEntries();
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
        onDismiss("escape");
        break;
      case "Tab":
        // Not prevented: the browser's own Tab continues from where the owner puts focus.
        onDismiss("tab");
        return;
      default:
        return;
    }
    event.preventDefault();
  };

  return (
    <div
      ref={menu}
      id={id}
      role="menu"
      aria-label={label}
      className="dm-menu-list"
      style={point && { position: "fixed", left: point.x, top: point.y }}
      onKeyDown={onKeyDown}
    >
      {items.map((item, index) => (
        <button
          key={item.id}
          ref={(element) => {
            entries.current[index] = element;
          }}
          type="button"
          role={
            item.checked === undefined
              ? "menuitem"
              : item.toggle === true
                ? "menuitemcheckbox"
                : "menuitemradio"
          }
          aria-checked={item.checked}
          tabIndex={-1}
          aria-disabled={item.disabled === true ? true : undefined}
          className="dm-menu-item"
          onClick={() => {
            if (!item.disabled) onChoose(item);
          }}
        >
          {item.icon !== undefined && (
            <span className="dm-menu-item-icon" aria-hidden="true">
              {item.icon}
            </span>
          )}
          {item.label}
          {item.checked !== undefined && (
            <span className="dm-menu-item-check" aria-hidden="true">
              {item.checked && (
                <svg viewBox="0 0 12 12">
                  <path d="M2.5 6.5l2.5 2.5 4.5-5.5" />
                </svg>
              )}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
