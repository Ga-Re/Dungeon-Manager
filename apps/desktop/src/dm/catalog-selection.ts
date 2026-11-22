import { createContext } from "react";

/**
 * The catalog item selected in the data panel (T-125), shown in the Eigenschaften panel instead
 * of the browser's selection. Whichever was selected last wins: selecting in the browser clears
 * it. `null` outside a library (component tests of the campaign alone).
 */
export interface CatalogSelection {
  /** Library-relative path of the selected map, or `null`. */
  readonly selected: string | null;
  readonly select: (path: string | null) => void;
}

export const CatalogSelectionContext = createContext<CatalogSelection | null>(
  null,
);
