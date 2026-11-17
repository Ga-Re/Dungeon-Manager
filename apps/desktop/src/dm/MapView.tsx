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
  const renderer = useRef<Renderer | null>(null);
  const [size, setSize] = useState<Size | null>(null);
  const sizeNow = useRef<Size | null>(null);
  const [mapSize, setMapSize] = useState<Size | null>(null);
  const [camera, setCamera] = useState<Camera | null>(null);
  const [load, setLoad] = useState<LoadState>("loading");
  const drag = useRef<{ x: number; y: number } | null>(null);

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
    Promise.all([created, service.loadImage(path)]).then(
      ([view, image]) => {
        if (cancelled) return;
        // The box may have changed size while the map was loading.
        const current = sizeNow.current ?? initial;
        renderer.current = view;
        view.resize(current);
        view.setMap(image);
        const imageSize = { width: image.width, height: image.height };
        setMapSize(imageSize);
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
    };
  }, [service, path, ready]);

  useEffect(() => {
    if (size) renderer.current?.resize(size);
  }, [size]);

  useEffect(() => {
    if (camera) renderer.current?.setCamera(camera);
  }, [camera]);

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

  const onPointerDown = (event: PointerEvent) => {
    // Primary button only (touch and pen report it too); the others stay free for menus.
    if (event.button !== 0) return;
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
        onPointerCancel={onPointerUp}
        onKeyDown={onKeyDown}
      ></div>
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
