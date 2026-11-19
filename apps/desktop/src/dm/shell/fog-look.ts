import { createContext } from "react";

/**
 * Whether the fog has soft edges on this device (T-136a), as the settings dialog in `DmShell`
 * sets it. Outside a shell (component tests) the fog stays hard.
 */
export const SoftEdgesContext = createContext(false);
