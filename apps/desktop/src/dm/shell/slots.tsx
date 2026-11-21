import { createContext, useContext, type ReactNode } from "react";
import { createPortal } from "react-dom";

/** Places in the DM window's zone layout (ADR-0011) that nested components render into. */
export type ShellSlot =
  | "titleScene"
  | "ribbonScene"
  | "ribbonFog"
  | "ribbonDisplay"
  | "canvas"
  | "browser"
  | "details"
  | "dataPanel"
  | "settings"
  | "settingsTv"
  | "settingsCampaign"
  | "notices"
  | "dock";

/** The slot elements of the surrounding shell; `null` outside a shell. */
export const ShellSlotsContext = createContext<Partial<
  Record<ShellSlot, HTMLElement>
> | null>(null);

/**
 * Renders `children` into a zone of the shell, so a component deep in the data panel (e.g. the
 * open scene) can show its map on the canvas and its tools in the ribbon while keeping its state.
 * Outside a shell (component tests) the children render in place.
 */
export function ShellPortal({
  slot,
  children,
}: {
  readonly slot: ShellSlot;
  readonly children: ReactNode;
}) {
  const slots = useContext(ShellSlotsContext);
  if (slots === null) return <>{children}</>;
  const target = slots[slot];
  return target ? createPortal(children, target) : null;
}
