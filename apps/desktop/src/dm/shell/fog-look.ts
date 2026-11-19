import { createContext } from "react";
import type { FogLook } from "../../fog-settings.js";

/**
 * How the fog looks on this device (T-136a, T-136b), as the settings dialog in `DmShell` sets
 * it. Outside a shell (component tests) the fog is hard and does not fade.
 */
export const FogLookContext = createContext<FogLook>({
  softEdges: false,
  fadeSeconds: 0,
});
