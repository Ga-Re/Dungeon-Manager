import {
  fitCamera,
  panBy,
  rotateBy,
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
  type WheelEvent,
} from "react";
import { useTranslation } from "react-i18next";
import type { MapViewService } from "../platform/map-images.js";

/** Provided once in `main.tsx`, so panels deep in the tree can show maps. */
export const MapViewContext = createContext<MapViewService | null>(null);

const KEY_ZOOM = 1.25;
const KEY_PAN = 80;

type LoadState = "loading" | "ready" | "error";

/** A map with zoom (wheel, +/−), pan (drag, arrow keys), rotation and "fit" (DM window). */
export function MapView({
  path,
  label,
}: {
  readonly path: string;
  readonly label: string;
}) {
  const { t } = useTranslation();
  const service = useContext(MapViewContext);
  const host = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const renderer = useRef<Renderer | null>(null);
  const [size, setSize] = useState<Size | null>(null);
  const [mapSize, setMapSize] = useState<Size | null>(null);
  const [camera, setCamera] = useState<Camera | null>(null);
  const [load, setLoad] = useState<LoadState>("loading");
  const drag = useRef<{ x: number; y: number } | null>(null);

  // The view follows the size of its box.
  useEffect(() => {
    const element = host.current;
    if (!element) return;
    const measure = () => {
      setSize({ width: element.clientWidth, height: element.clientHeight });
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, []);

  // One renderer per mounted view; the map is (re)loaded when the path changes.
  const ready = size !== null && size.width > 0 && size.height > 0;
  useEffect(() => {
    if (!service || !canvas.current || !ready) return;
    let cancelled = false;
    setLoad("loading");
    const element = canvas.current;
    const created = Promise.all([
      service.createRenderer(element, size),
      service.loadImage(path),
    ]);
    created.then(
      ([view, image]) => {
        if (cancelled) {
          view.destroy();
          return;
        }
        renderer.current = view;
        view.setMap(image);
        const imageSize = { width: image.width, height: image.height };
        setMapSize(imageSize);
        setCamera(fitCamera(imageSize, size, 0));
        setLoad("ready");
      },
      () => {
        if (!cancelled) setLoad("error");
      },
    );
    return () => {
      cancelled = true;
      renderer.current?.destroy();
      renderer.current = null;
    };
    // Created once per map (not per size): size changes go to `resize` below.
  }, [service, path, ready]);

  useEffect(() => {
    if (size) renderer.current?.resize(size);
  }, [size]);

  useEffect(() => {
    if (camera) renderer.current?.setCamera(camera);
  }, [camera]);

  const change = (update: (current: Camera, view: Size) => Camera) => {
    if (camera && size) setCamera(update(camera, size));
  };
  const fit = () => {
    change((current, view) =>
      mapSize ? fitCamera(mapSize, view, current.rotation) : current,
    );
  };
  const centre = (view: Size) => ({ x: view.width / 2, y: view.height / 2 });

  const onWheel = (event: WheelEvent) => {
    const box = event.currentTarget.getBoundingClientRect();
    const anchor = { x: event.clientX - box.left, y: event.clientY - box.top };
    change((current, view) =>
      zoomAt(current, Math.exp(-event.deltaY * 0.0015), anchor, view),
    );
  };
  const onPointerDown = (event: PointerEvent) => {
    drag.current = { x: event.clientX, y: event.clientY };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const onPointerMove = (event: PointerEvent) => {
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
  };
  const onKeyDown = (event: KeyboardEvent) => {
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
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onKeyDown={onKeyDown}
      >
        <canvas ref={canvas} />
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
