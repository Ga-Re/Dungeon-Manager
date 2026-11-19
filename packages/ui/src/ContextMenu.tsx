import { MenuList, type MenuItem } from "./MenuList.js";

/** Where a {@link ContextMenu} opens, in viewport pixels. */
export interface MenuPoint {
  x: number;
  y: number;
}

/** Props of {@link ContextMenu}. */
export interface ContextMenuProps {
  /** Open at this point; `null` renders nothing. */
  at: MenuPoint | null;
  /** Translated accessible name. */
  label: string;
  items: readonly MenuItem[];
  /** Called with the chosen item's id after the menu closed. */
  onSelect: (id: string) => void;
  /** The menu wants to close (Escape, Tab, press outside, or after a choice). */
  onClose: () => void;
  /** Gets focus back when the menu closes (the item it was opened on). */
  returnFocus?: HTMLElement | null | undefined;
}

/**
 * Right-click menu at the pointer (ADR-0011 marking menu, list form), e.g. "Neue Szene …" on a
 * browser item. Keyboard: opened with Shift+F10 or the context-menu key by its owner; otherwise
 * like {@link MenuList}.
 */
export function ContextMenu({
  at,
  label,
  items,
  onSelect,
  onClose,
  returnFocus,
}: ContextMenuProps) {
  if (!at) return null;
  return (
    <MenuList
      label={label}
      items={items}
      initial="first"
      style={{ position: "fixed", left: at.x, top: at.y }}
      onChoose={(item) => {
        returnFocus?.focus();
        onClose();
        onSelect(item.id);
      }}
      onDismiss={(reason) => {
        if (reason !== "outside") returnFocus?.focus();
        onClose();
      }}
    />
  );
}
