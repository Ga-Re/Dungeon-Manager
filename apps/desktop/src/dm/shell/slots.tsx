import { createContext, useContext, type ReactNode } from "react";
import { createPortal } from "react-dom";

/** Places in the DM window's zone layout (ADR-0011) that nested components render into. */
export type ShellSlot =
  | "titleScene"
  | "ribbonScene"
  | "ribbonFog"
  | "ribbonDisplay"
  | "ribbonForgeMap"
  | "ribbonForgeRooms"
  | "command"
  | "canvas"
  | "browser"
  | "details"
  | "initiative"
  | "preview"
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
  when = true,
  children,
}: {
  readonly slot: ShellSlot;
  /** `false` leaves the zone to someone else (e.g. the Map Forge's document, T-176a). */
  readonly when?: boolean;
  readonly children: ReactNode;
}) {
  const slots = useContext(ShellSlotsContext);
  if (!when) return null;
  if (slots === null) return <>{children}</>;
  const target = slots[slot];
  return target ? createPortal(children, target) : null;
}
