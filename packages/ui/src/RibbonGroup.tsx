import type { ReactNode, Ref } from "react";
import { Menu, type MenuItem } from "./Menu.js";

/** Props of {@link RibbonGroup}. */
export interface RibbonGroupProps {
  /** Translated caption under the tools; also names the group. */
  caption: string;
  /** Less frequent commands: the caption becomes a menu button ("Szene ▾"). */
  menu?:
    | {
        readonly items: readonly MenuItem[];
        readonly onSelect: (id: string) => void;
        readonly buttonRef?: Ref<HTMLButtonElement> | undefined;
        readonly onOpen?: (() => void) | undefined;
      }
    | undefined;
  /** The group's tools, usually labelled `IconButton`s. */
  children?: ReactNode;
}

/** A group of ribbon tools with its caption below, as in CAD ribbons (ADR-0011). */
export function RibbonGroup({ caption, menu, children }: RibbonGroupProps) {
  return (
    <div role="group" aria-label={caption} className="dm-ribbon-group">
      <div className="dm-ribbon-group-tools">{children}</div>
      {menu ? (
        <Menu
          label={caption}
          items={menu.items}
          onSelect={menu.onSelect}
          buttonRef={menu.buttonRef}
          onOpen={menu.onOpen}
          className="dm-ribbon-group-caption"
        />
      ) : (
        <span className="dm-ribbon-group-caption" aria-hidden="true">
          {caption}
        </span>
      )}
    </div>
  );
}
