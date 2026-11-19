import {
  useEffect,
  useRef,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from "react";

/** One command of a {@link Menu} or {@link ContextMenu}. */
export interface MenuItem {
  id: string;
  /** Translated, user-visible name of the command. */
  label: string;
  /** Decorative icon in front of the label. */
  icon?: ReactNode;
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
  style?: CSSProperties | undefined;
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
  style,
}: MenuListProps) {
  const menu = useRef<HTMLDivElement>(null);
  const entries = useRef<(HTMLButtonElement | null)[]>([]);
  const dismiss = useRef(onDismiss);
  useEffect(() => {
    dismiss.current = onDismiss;
  });

  const enabledEntries = () =>
    entries.current.filter(
      (entry): entry is HTMLButtonElement => entry !== null,
    );

  useEffect(() => {
    const list = enabledEntries();
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
    const list = enabledEntries();
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
      style={style}
      onKeyDown={onKeyDown}
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
            if (!item.disabled) onChoose(item);
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
  );
}
