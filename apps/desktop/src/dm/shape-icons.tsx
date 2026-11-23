import { Brush, Circle, Lasso, Pentagon, Square } from "lucide-react";
import type { ReactNode } from "react";
import type { FogShape } from "./fog-shapes.js";

/**
 * The icon of each drawing shape, the same wherever the DM draws – fog at the table, areas in
 * the Map Forge (T-260, DM decision 2026-11-23).
 */
export const SHAPE_ICONS: Readonly<Record<FogShape, ReactNode>> = {
  rectangle: <Square />,
  ellipse: <Circle />,
  polygon: <Pentagon />,
  lasso: <Lasso />,
  brush: <Brush />,
};
