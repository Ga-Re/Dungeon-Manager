import {
  mapToScreen,
  screenToMap,
  type Camera,
  type Point,
  type Size,
} from "@dungeon-manager/renderer";
import { useRef, type KeyboardEvent, type PointerEvent } from "react";
import { useTranslation } from "react-i18next";

/**
 * The TV's view as a frame on the DM's map (T-106c, DM decision 2026-11-20): the DM drags it, or
 * moves it with the arrow keys by one cell, to where play happens; the TV follows. Map pixels in,
 * screen pixels out through the DM's camera (also when the DM's view is rotated).
 */
export function TvFrame({
  camera,
  view,
  area,
  center,
  cellSizePx,
  movable,
  onMove,
}: {
  readonly camera: Camera;
  /** The DM view's size in screen pixels. */
  readonly view: Size;
  /** The map area the TV shows, in map pixels. */
  readonly area: Size;
  /** Its centre on the map. */
  readonly center: Point;
  /** One arrow key step. */
  readonly cellSizePx: number;
  /** Only with the pan tool: a fog tool draws where the frame is. */
  readonly movable: boolean;
  readonly onMove: (center: Point) => void;
}) {
  const { t } = useTranslation();
  const dragging = useRef<{ start: Point; center: Point } | null>(null);
  const left = center.x - area.width / 2;
  const top = center.y - area.height / 2;
  const corners = [
    { x: left, y: top },
    { x: left + area.width, y: top },
    { x: left + area.width, y: top + area.height },
    { x: left, y: top + area.height },
  ].map((corner) => mapToScreen(camera, view, corner));
  const points = corners
    .map(({ x, y }) => `${String(x)},${String(y)}`)
    .join(" ");
  const local = (event: PointerEvent<SVGElement>): Point => {
    const box = event.currentTarget.ownerSVGElement?.getBoundingClientRect();
    return {
      x: event.clientX - (box?.left ?? 0),
      y: event.clientY - (box?.top ?? 0),
    };
  };

  const onPointerDown = (event: PointerEvent<SVGPolygonElement>) => {
    if (event.button !== 0) return;
    // The frame is moved, not the map below it.
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragging.current = {
      start: screenToMap(camera, view, local(event)),
      center,
    };
  };
  const onPointerMove = (event: PointerEvent<SVGPolygonElement>) => {
    const drag = dragging.current;
    if (!drag) return;
    event.stopPropagation();
    const now = screenToMap(camera, view, local(event));
    onMove({
      x: drag.center.x + now.x - drag.start.x,
      y: drag.center.y + now.y - drag.start.y,
    });
  };
  const onPointerUp = (event: PointerEvent<SVGPolygonElement>) => {
    if (!dragging.current) return;
    event.stopPropagation();
    dragging.current = null;
  };
  const onKeyDown = (event: KeyboardEvent<SVGPolygonElement>) => {
    const step: Record<string, Point> = {
      ArrowLeft: { x: -cellSizePx, y: 0 },
      ArrowRight: { x: cellSizePx, y: 0 },
      ArrowUp: { x: 0, y: -cellSizePx },
      ArrowDown: { x: 0, y: cellSizePx },
    };
    const by = step[event.key];
    if (!by) return;
    // The map's own arrow keys pan the DM's view; here they move the TV's.
    event.preventDefault();
    event.stopPropagation();
    onMove({ x: center.x + by.x, y: center.y + by.y });
  };

  return (
    <svg className="map-view-tv-frame" data-movable={movable}>
      <polygon
        points={points}
        role="button"
        tabIndex={movable ? 0 : -1}
        aria-label={t("mapView.tvFrame")}
        aria-keyshortcuts="ArrowLeft ArrowRight ArrowUp ArrowDown"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onKeyDown={onKeyDown}
      />
    </svg>
  );
}
