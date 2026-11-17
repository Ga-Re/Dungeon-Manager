import {
  fitCamera,
  panBy,
  rotateBy,
  screenToMap,
  zoomAt,
  type Camera,
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
import { useTranslation } from "react-i18next";
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
/** Smaller drags are taken as slips, not areas. */
const MIN_AREA_PX = 4;

interface Selection {
  readonly start: { readonly x: number; readonly y: number };
  readonly end: { readonly x: number; readonly y: number };
}

/** A map with zoom (wheel, +/−), pan (drag, arrow keys), rotation and "fit" (DM window). */
export function MapView({
  path,
  kind = "image",
  label,
  fog = null,
  tool = "pan",
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
  /** A rectangle the DM marked with the reveal or hide tool, in map pixels. */
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
  const [selection, setSelection] = useState<Selection | null>(null);
  const fogNow = useRef(fog);
  fogNow.current = fog;

  // The view follows the size of its box.
  useEffect(() => {
    const element = host.current;
    if (!element) return;
    const measure = () => {
      const measured = {
        width: element.clientWidth,
        height: element.clientHeight,
      };
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
        view.setFog(fogNow.current, { opacity: DM_FOG_OPACITY });
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

  useEffect(() => {
    renderer.current?.setFog(fog, { opacity: DM_FOG_OPACITY });
  }, [fog]);

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

  const local = (event: PointerEvent) => {
    const box = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - box.left, y: event.clientY - box.top };
  };
  const onPointerDown = (event: PointerEvent) => {
    // Primary button only (touch and pen report it too); the others stay free for menus.
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    if (tool === "pan") {
      drag.current = { x: event.clientX, y: event.clientY };
      return;
    }
    const point = local(event);
    setSelection({ start: point, end: point });
  };
  const onPointerMove = (event: PointerEvent) => {
    if (selection) {
      const end = local(event);
      setSelection({ ...selection, end });
      return;
    }
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
    const marked = selection;
    setSelection(null);
    const view = sizeNow.current;
    if (!marked || !camera || !view || tool === "pan") return;
    const { start, end } = marked;
    if (
      Math.abs(end.x - start.x) < MIN_AREA_PX ||
      Math.abs(end.y - start.y) < MIN_AREA_PX
    )
      return;
    // All four corners: with the view rotated, a screen rectangle is still a map rectangle, but
    // its corners swap places.
    const corners = [
      start,
      { x: end.x, y: start.y },
      end,
      { x: start.x, y: end.y },
    ].map((corner) => {
      const point = screenToMap(camera, view, corner);
      return [point.x, point.y] as [number, number];
    });
    onArea?.({ outer: corners, holes: [] }, tool);
  };
  const onPointerCancel = () => {
    drag.current = null;
    setSelection(null);
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape" && selection) {
      setSelection(null);
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
        aria-describedby="map-view-help"
        tabIndex={0}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onKeyDown={onKeyDown}
        data-tool={tool}
      >
        {selection && (
          <div
            className={`map-view-selection map-view-selection-${tool}`}
            style={{
              left: Math.min(selection.start.x, selection.end.x),
              top: Math.min(selection.start.y, selection.end.y),
              width: Math.abs(selection.end.x - selection.start.x),
              height: Math.abs(selection.end.y - selection.start.y),
            }}
          />
        )}
      </div>
      <p id="map-view-help" className="map-view-help">
        {t("mapView.help")}
      </p>
      {load === "loading" && <p>{t("mapView.loading")}</p>}
      {load === "error" && <p role="alert">{t("mapView.error")}</p>}
      <button type="button" disabled={load !== "ready"} onClick={fit}>
        {t("mapView.fit")}
      </button>
      <button
        type="button"
        disabled={load !== "ready"}
        onClick={() => {
          change((current) => rotateBy(current, 90));
        }}
      >
        {t("mapView.rotate")}
      </button>
    </div>
  );
}
