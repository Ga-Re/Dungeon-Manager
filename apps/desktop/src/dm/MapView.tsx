import {
  fitCamera,
  panBy,
  mapToScreen,
  rotateBy,
  screenToMap,
  zoomAt,
  type Camera,
  type Point,
  type Renderer,
  type Size,
} from "@dungeon-manager/renderer";
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import type { Polygon } from "@dungeon-manager/schema";
import { IconButton } from "@dungeon-manager/ui";
import { RotateCw, Scan, ZoomIn, ZoomOut } from "lucide-react";
import { ShellPortal } from "./shell/slots.js";
import { useTranslation } from "react-i18next";
import { FogPreview } from "./FogPreview.js";
import {
  brushArea,
  dragArea,
  polygonArea,
  type FogShape,
} from "./fog-shapes.js";
import { releaseVideo, type MapViewService } from "../platform/map-images.js";

/** Provided once in `main.tsx`, so panels deep in the tree can show maps. */
export const MapViewContext = createContext<MapViewService | null>(null);

const KEY_ZOOM = 1.25;
const KEY_PAN = 80;

type LoadState = "loading" | "ready" | "error";

/** What dragging on the map does: move it, or mark an area to reveal or hide. */
export type MapTool = "pan" | "reveal" | "hide";

/** The DM sees fog, but must see what lies beneath it. */
const DM_FOG_OPACITY = 0.55;
/** A click this close to the first corner closes a polygon. */
const CLOSE_PX = 12;
/** Clicks this close to the last corner add none (e.g. the clicks of a double click). */
const SAME_SPOT_PX = 4;

/** A drag or stroke in progress, in screen pixels of the view. */
type Drawing =
  | {
      readonly kind: "drag";
      readonly shape: "rectangle" | "circle";
      readonly start: Point;
      readonly end: Point;
    }
  | { readonly kind: "brush"; readonly points: readonly Point[] };

/** A map with zoom (wheel, +/−), pan (drag, arrow keys), rotation and "fit" (DM window). */
export function MapView({
  path,
  kind = "image",
  label,
  fog = null,
  tool = "pan",
  shape = "rectangle",
  brushRadius = 50,
  cornerRadius = 0,
  softEdge = 0,
  fade = 0,
  onArea,
  onMapSize,
}: {
  readonly path: string;
  /** Video maps play in a `<video>` under the canvas (ADR-0010). */
  readonly kind?: "image" | "video";
  readonly label: string;
  /** Revealed areas, shown see-through to the DM; `null` shows no fog. */
  readonly fog?: readonly Polygon[] | null;
  readonly tool?: MapTool;
  /** How the reveal and hide tools mark an area. */
  readonly shape?: FogShape;
  /** Brush radius in map pixels. */
  readonly brushRadius?: number;
  /** Rounding of the rectangle tool's corners in map pixels (T-170); 0 keeps them sharp. */
  readonly cornerRadius?: number;
  /** Soft fog edge in map pixels (T-136a); 0 draws hard edges. */
  readonly softEdge?: number;
  /** How long fog changes fade, in milliseconds (T-136b); 0 switches at once. */
  readonly fade?: number;
  /** An area the DM marked with the reveal or hide tool, in map pixels. */
  readonly onArea?: (area: Polygon, tool: Exclude<MapTool, "pan">) => void;
  readonly onMapSize?: (size: Size) => void;
}) {
  const { t } = useTranslation();
  const service = useContext(MapViewContext);
  const host = useRef<HTMLDivElement>(null);
  const renderer = useRef<Renderer | null>(null);
  const [size, setSize] = useState<Size | null>(null);
  const sizeNow = useRef<Size | null>(null);
  const [mapSize, setMapSize] = useState<Size | null>(null);
  const [camera, setCamera] = useState<Camera | null>(null);
  const [load, setLoad] = useState<LoadState>("loading");
  const drag = useRef<{ x: number; y: number } | null>(null);
  const [drawing, setDrawing] = useState<Drawing | null>(null);
  // Polygon corners in map pixels, so panning with the keys between clicks keeps them in place.
  const [corners, setCorners] = useState<readonly [number, number][]>([]);
  const [hover, setHover] = useState<Point | null>(null);
  // Where the pointer is over the map while the brush is chosen: its outline shows there, at
  // the size it paints (T-170).
  const [pointer, setPointer] = useState<Point | null>(null);
  const brushing = tool !== "pan" && shape === "brush";

  // Switching tools drops a half-drawn shape.
  useEffect(() => {
    setDrawing(null);
    setCorners([]);
    setHover(null);
    setPointer(null);
  }, [tool, shape]);
  const fogNow = useRef(fog);
  fogNow.current = fog;
  const fogOptions = { opacity: DM_FOG_OPACITY, softEdge };
  const fogOptionsNow = useRef(fogOptions);
  fogOptionsNow.current = fogOptions;

  // The view follows the size of its box. A box of no size is a hidden map panel (T-172a): the
  // view keeps its last size, so the renderer, the loaded map and the camera survive until the
  // panel shows again.
  useEffect(() => {
    const element = host.current;
    if (!element) return;
    const measure = () => {
      const measured = {
        width: element.clientWidth,
        height: element.clientHeight,
      };
      if (measured.width <= 0 || measured.height <= 0) return;
      sizeNow.current = measured;
      setSize(measured);
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, []);

  // One renderer per map, each on its own canvas: a WebGL context belongs to its canvas, and
  // destroying one renderer must never take another one's context with it (e.g. in React's
  // StrictMode, which mounts effects twice). The renderer is always released through its
  // promise, also when the map fails to load or the view goes away while loading.
  const ready = size !== null && size.width > 0 && size.height > 0;
  useEffect(() => {
    const element = host.current;
    const initial = sizeNow.current;
    if (!service || !element || !initial || !ready) return;
    let cancelled = false;
    setLoad("loading");
    const canvas = document.createElement("canvas");
    element.appendChild(canvas);
    const created = service.createRenderer(canvas, initial);
    let video: HTMLVideoElement | null = null;
    const media =
      kind === "video"
        ? service.loadVideo(path).then((loaded) => {
            video = loaded;
            return loaded;
          })
        : service.loadImage(path);
    Promise.all([created, media]).then(
      ([view, loaded]) => {
        if (cancelled) return;
        // The box may have changed size while the map was loading.
        const current = sizeNow.current ?? initial;
        renderer.current = view;
        view.resize(current);
        view.setFog(fogNow.current, fogOptionsNow.current);
        let imageSize: Size;
        if (loaded instanceof HTMLVideoElement) {
          canvas.before(loaded);
          view.setVideo(loaded);
          imageSize = { width: loaded.videoWidth, height: loaded.videoHeight };
        } else {
          view.setMap(loaded);
          imageSize = { width: loaded.width, height: loaded.height };
        }
        setMapSize(imageSize);
        onMapSize?.(imageSize);
        setCamera(fitCamera(imageSize, current, 0));
        setLoad("ready");
      },
      () => {
        // A video that loads although the renderer did not would otherwise play on, unseen –
        // also when it finishes loading only after the renderer failed.
        void media.then(
          (loaded) => {
            if (loaded instanceof HTMLVideoElement) releaseVideo(loaded);
          },
          () => undefined,
        );
        if (!cancelled) setLoad("error");
      },
    );
    return () => {
      cancelled = true;
      renderer.current = null;
      created.then(
        (view) => {
          view.destroy();
        },
        () => undefined,
      );
      canvas.remove();
      releaseVideo(video);
      void media.then(
        () => {
          // A video that finished loading after the view went away is released too.
          if (cancelled) releaseVideo(video);
        },
        () => undefined,
      );
    };
  }, [service, path, kind, ready]);

  useEffect(() => {
    if (size) renderer.current?.resize(size);
  }, [size]);

  useEffect(() => {
    if (camera) renderer.current?.setCamera(camera);
  }, [camera]);

  // The fade duration applies to the next change; changing it alone redraws nothing.
  const fadeNow = useRef(fade);
  fadeNow.current = fade;
  useEffect(() => {
    renderer.current?.setFog(fog, {
      opacity: DM_FOG_OPACITY,
      softEdge,
      fade: fadeNow.current,
    });
  }, [fog, softEdge]);

  // Functional updates: event handlers (also the native wheel listener) never see a stale camera.
  const change = (update: (current: Camera, view: Size) => Camera) => {
    setCamera((current) => {
      const view = sizeNow.current;
      return current && view ? update(current, view) : current;
    });
  };
  const fit = () => {
    change((current, view) =>
      mapSize ? fitCamera(mapSize, view, current.rotation) : current,
    );
  };
  const centre = (view: Size) => ({ x: view.width / 2, y: view.height / 2 });

  // A native, non-passive listener: zooming must not also scroll the page (React's wheel
  // handlers are passive and cannot prevent that).
  useEffect(() => {
    const element = host.current;
    if (!element) return;
    const onWheel = (event: globalThis.WheelEvent) => {
      event.preventDefault();
      const box = element.getBoundingClientRect();
      const anchor = {
        x: event.clientX - box.left,
        y: event.clientY - box.top,
      };
      setCamera((current) => {
        const view = sizeNow.current;
        return current && view
          ? zoomAt(current, Math.exp(-event.deltaY * 0.0015), anchor, view)
          : current;
      });
    };
    element.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      element.removeEventListener("wheel", onWheel);
    };
  }, []);

  const local = (event: {
    clientX: number;
    clientY: number;
    currentTarget: Element;
  }) => {
    const box = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - box.left, y: event.clientY - box.top };
  };
  const mark = (area: Polygon | null) => {
    if (area && tool !== "pan") onArea?.(area, tool);
  };
  const finishPolygon = () => {
    mark(polygonArea(corners));
    setCorners([]);
    setHover(null);
  };
  const addCorner = (point: Point) => {
    const view = sizeNow.current;
    if (!camera || !view) return;
    const first = corners[0];
    if (first && corners.length >= 3) {
      const shown = mapToScreen(camera, view, { x: first[0], y: first[1] });
      if (Math.hypot(shown.x - point.x, shown.y - point.y) <= CLOSE_PX) {
        finishPolygon();
        return;
      }
    }
    // A double click sends two clicks on one spot first: the second is no new corner.
    const last = corners.at(-1);
    if (last) {
      const shown = mapToScreen(camera, view, { x: last[0], y: last[1] });
      if (Math.hypot(shown.x - point.x, shown.y - point.y) <= SAME_SPOT_PX)
        return;
    }
    const mapped = screenToMap(camera, view, point);
    setCorners([...corners, [mapped.x, mapped.y]]);
  };

  const onPointerDown = (event: PointerEvent) => {
    // Primary button only (touch and pen report it too); the others stay free for menus.
    if (event.button !== 0) return;
    const point = local(event);
    if (tool !== "pan" && shape === "polygon") {
      addCorner(point);
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    if (tool === "pan") drag.current = { x: event.clientX, y: event.clientY };
    else if (shape === "brush") setDrawing({ kind: "brush", points: [point] });
    else if (shape !== "polygon")
      setDrawing({ kind: "drag", shape, start: point, end: point });
  };
  const onPointerMove = (event: PointerEvent) => {
    const point = local(event);
    // Touch has no hover: the outline would only sit under the finger.
    if (brushing && event.pointerType !== "touch") setPointer(point);
    if (drawing?.kind === "drag") {
      setDrawing({ ...drawing, end: point });
      return;
    }
    if (drawing?.kind === "brush") {
      setDrawing({ kind: "brush", points: [...drawing.points, point] });
      return;
    }
    if (corners.length > 0) setHover(point);
    const start = drag.current;
    if (!start) return;
    drag.current = { x: event.clientX, y: event.clientY };
    change((current) =>
      panBy(current, {
        x: event.clientX - start.x,
        y: event.clientY - start.y,
      }),
    );
  };
  const onPointerUp = () => {
    drag.current = null;
    const done = drawing;
    setDrawing(null);
    const view = sizeNow.current;
    if (!done || !camera || !view) return;
    if (done.kind === "brush") {
      const stroke = brushArea(done.points, brushRadius, camera, view);
      if (!stroke)
        console.warn("A brush stroke could not be turned into an area.");
      mark(stroke);
    } else
      mark(
        dragArea(done.shape, done.start, done.end, camera, view, cornerRadius),
      );
  };
  const onPointerCancel = () => {
    drag.current = null;
    setDrawing(null);
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape" && (drawing || corners.length > 0)) {
      setDrawing(null);
      setCorners([]);
      setHover(null);
      return;
    }
    if (corners.length > 0 && event.key === "Enter") {
      event.preventDefault();
      finishPolygon();
      return;
    }
    if (corners.length > 0 && event.key === "Backspace") {
      event.preventDefault();
      setCorners(corners.slice(0, -1));
      return;
    }
    // Ctrl/Cmd + "+", "−", "0" belong to the browser and the OS.
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const actions: Record<string, (current: Camera, view: Size) => Camera> = {
      "+": (current, view) => zoomAt(current, KEY_ZOOM, centre(view), view),
      "=": (current, view) => zoomAt(current, KEY_ZOOM, centre(view), view),
      "-": (current, view) => zoomAt(current, 1 / KEY_ZOOM, centre(view), view),
      ArrowLeft: (current) => panBy(current, { x: KEY_PAN, y: 0 }),
      ArrowRight: (current) => panBy(current, { x: -KEY_PAN, y: 0 }),
      ArrowUp: (current) => panBy(current, { x: 0, y: KEY_PAN }),
      ArrowDown: (current) => panBy(current, { x: 0, y: -KEY_PAN }),
      r: (current) => rotateBy(current, 90),
      R: (current) => rotateBy(current, -90),
    };
    if (event.key === "0") {
      event.preventDefault();
      fit();
      return;
    }
    const action = actions[event.key];
    if (!action) return;
    event.preventDefault();
    change(action);
  };

  return (
    <div className="map-view">
      <div
        ref={host}
        className="map-view-canvas"
        role="application"
        aria-label={t("mapView.label", { name: label })}
        aria-describedby={
          tool === "pan" ? "map-view-help" : "map-view-help map-view-hint"
        }
        tabIndex={0}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onPointerLeave={() => {
          setPointer(null);
        }}
        onKeyDown={onKeyDown}
        onDoubleClick={() => {
          if (corners.length > 0) finishPolygon();
        }}
        data-tool={tool}
      >
        {camera && sizeNow.current && tool !== "pan" && (
          <FogPreview
            tool={tool}
            drawing={drawing}
            corners={corners.map(([x, y]) =>
              mapToScreen(camera, sizeNow.current ?? { width: 0, height: 0 }, {
                x,
                y,
              }),
            )}
            hover={hover}
            brushWidth={2 * brushRadius * camera.zoom}
            cornerRadius={cornerRadius * camera.zoom}
            brushAt={brushing ? pointer : null}
          />
        )}
      </div>
      {/* What the keys do, for screen readers; the drawing tool's instructions show above the
          dock while it is active (T-131). */}
      <p id="map-view-help" className="visually-hidden">
        {t("mapView.help")}
      </p>
      <ShellPortal slot="notices">
        {tool !== "pan" && (
          <p id="map-view-hint" className="map-view-hint">
            {t(`fog.shapeHints.${shape}`)}
          </p>
        )}
        {load === "loading" && <p>{t("mapView.loading")}</p>}
        {load === "error" && <p role="alert">{t("mapView.error")}</p>}
      </ShellPortal>
      {/* Navigation of the DM's view in the dock (T-131): its keys are −, 0, + and r. */}
      <ShellPortal slot="dock">
        <div className="dm-dock-group">
          <IconButton
            icon={<ZoomOut />}
            label={t("mapView.zoomOut")}
            aria-keyshortcuts="-"
            disabled={load !== "ready"}
            onClick={() => {
              change((current, view) =>
                zoomAt(current, 1 / KEY_ZOOM, centre(view), view),
              );
            }}
          />
          <IconButton
            icon={<Scan />}
            label={t("mapView.fit")}
            aria-keyshortcuts="0"
            disabled={load !== "ready"}
            onClick={fit}
          />
          <IconButton
            icon={<ZoomIn />}
            label={t("mapView.zoomIn")}
            aria-keyshortcuts="+"
            disabled={load !== "ready"}
            onClick={() => {
              change((current, view) =>
                zoomAt(current, KEY_ZOOM, centre(view), view),
              );
            }}
          />
          <IconButton
            icon={<RotateCw />}
            label={t("mapView.rotate")}
            aria-keyshortcuts="r"
            disabled={load !== "ready"}
            onClick={() => {
              change((current) => rotateBy(current, 90));
            }}
          />
        </div>
      </ShellPortal>
    </div>
  );
}
