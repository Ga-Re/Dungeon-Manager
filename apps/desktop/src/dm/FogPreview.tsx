import type { Point } from "@dungeon-manager/renderer";

type Drawing =
  | {
      readonly kind: "drag";
      readonly shape: "rectangle" | "circle";
      readonly start: Point;
      readonly end: Point;
    }
  | { readonly kind: "brush"; readonly points: readonly Point[] };

const points = (list: readonly Point[]) =>
  list.map(({ x, y }) => `${String(x)},${String(y)}`).join(" ");

/** The shape being drawn, over the map (screen pixels); the fog changes only when it is done. */
export function FogPreview({
  tool,
  drawing,
  corners,
  hover,
  brushWidth,
}: {
  readonly tool: "reveal" | "hide";
  readonly drawing: Drawing | null;
  /** Polygon corners so far, already in screen pixels. */
  readonly corners: readonly Point[];
  readonly hover: Point | null;
  readonly brushWidth: number;
}) {
  if (!drawing && corners.length === 0) return null;
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
        />
      )}
      {drawing?.kind === "drag" && drawing.shape === "circle" && (
        <circle
          cx={drawing.start.x}
          cy={drawing.start.y}
          r={Math.hypot(
            drawing.end.x - drawing.start.x,
            drawing.end.y - drawing.start.y,
          )}
        />
      )}
      {drawing?.kind === "brush" && (
        <polyline
          className="map-view-preview-brush"
          points={points(drawing.points)}
          strokeWidth={brushWidth}
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
