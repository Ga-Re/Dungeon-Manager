import { createContext } from "react";

/**
 * Opens a library map in the Map Forge as its document (T-176a). `null` outside a library
 * (component tests of the catalog alone), where there is no forge to open it in.
 */
export interface MapForgeControl {
  readonly open: (path: string) => void;
}

export const MapForgeContext = createContext<MapForgeControl | null>(null);
