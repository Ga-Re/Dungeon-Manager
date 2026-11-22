import type { Point } from "@dungeon-manager/renderer";
import { squareEnd } from "./fog-shapes.js";

type Drawing =
  | {
      readonly kind: "drag";
      readonly shape: "rectangle" | "ellipse";
      readonly start: Point;
      readonly end: Point;
      readonly square?: boolean;
    }
  | { readonly kind: "brush"; readonly points: readonly Point[] }
  | { readonly kind: "lasso"; readonly points: readonly Point[] };

const points = (list: readonly Point[]) =>
  list.map(({ x, y }) => `${String(x)},${String(y)}`).join(" ");

/** The shape being drawn, over the map (screen pixels); the fog changes only when it is done. */
export function FogPreview({
  tool,
  drawing,
  corners,
  hover,
  brushWidth,
  cornerRadius = 0,
  brushAt = null,
}: {
  readonly tool: "reveal" | "hide";
  readonly drawing: Drawing | null;
  /** Polygon corners so far, already in screen pixels. */
  readonly corners: readonly Point[];
  readonly hover: Point | null;
  readonly brushWidth: number;
  /** Rounding of the rectangle's corners, in screen pixels. */
  readonly cornerRadius?: number;
  /** Where the brush is (screen pixels): its outline shows how big it paints. */
  readonly brushAt?: Point | null;
}) {
  if (!drawing && corners.length === 0 && !brushAt) return null;
  return (
    <svg
      className={`map-view-preview map-view-preview-${tool}`}
      aria-hidden="true"
    >
      {drawing?.kind === "drag" && drawing.shape === "rectangle" && (
        <rect
          x={Math.min(drawing.start.x, drawing.end.x)}
          y={Math.min(drawing.start.y, drawing.end.y)}
          width={Math.abs(drawing.end.x - drawing.start.x)}
          height={Math.abs(drawing.end.y - drawing.start.y)}
          rx={Math.min(
            cornerRadius,
            Math.abs(drawing.end.x - drawing.start.x) / 2,
            Math.abs(drawing.end.y - drawing.start.y) / 2,
          )}
        />
      )}
      {drawing?.kind === "drag" &&
        drawing.shape === "ellipse" &&
        (() => {
          // Shift: a circle on the box's longer side, as the area will be (T-247).
          const end =
            drawing.square === true
              ? squareEnd(drawing.start, drawing.end)
              : drawing.end;
          return (
            <ellipse
              cx={(drawing.start.x + end.x) / 2}
              cy={(drawing.start.y + end.y) / 2}
              rx={Math.abs(end.x - drawing.start.x) / 2}
              ry={Math.abs(end.y - drawing.start.y) / 2}
            />
          );
        })()}
      {drawing?.kind === "lasso" && (
        <polygon
          className="map-view-preview-lasso"
          points={points(drawing.points)}
        />
      )}
      {drawing?.kind === "brush" &&
        drawing.points.length === 1 &&
        drawing.points[0] && (
          // A single click is a dab: a polyline of one point would draw nothing.
          <circle
            className="map-view-preview-dab"
            cx={drawing.points[0].x}
            cy={drawing.points[0].y}
            r={brushWidth / 2}
          />
        )}
      {drawing?.kind === "brush" && drawing.points.length > 1 && (
        <polyline
          className="map-view-preview-brush"
          points={points(drawing.points)}
          strokeWidth={brushWidth}
        />
      )}
      {brushAt && (
        <circle
          className="map-view-preview-cursor"
          data-testid="brush-cursor"
          cx={brushAt.x}
          cy={brushAt.y}
          r={brushWidth / 2}
        />
      )}
      {corners.length > 0 && (
        <>
          <polyline
            className="map-view-preview-polygon"
            points={points(hover ? [...corners, hover] : corners)}
          />
          {corners.map((corner, index) => (
            <circle
              key={index}
              className={
                index === 0
                  ? "map-view-preview-first"
                  : "map-view-preview-corner"
              }
              cx={corner.x}
              cy={corner.y}
              r={index === 0 ? 7 : 4}
            />
          ))}
        </>
      )}
    </svg>
  );
}
