import {
  fitCamera,
  panBy,
  mapToScreen,
  rotateBy,
  screenToMap,
  zoomAt,
  type Camera,
  type FogOptions,
  type LivingFog,
  type Point,
  type Renderer,
  type Size,
  type TokenShape,
  TOKEN_GLIDE_MS,
} from "@dungeon-manager/renderer";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import type {
  Grid as GridCalibration,
  GridCell,
  Polygon,
} from "@dungeon-manager/schema";
import { IconButton } from "@dungeon-manager/ui";
import { Grid3x3, RotateCw, Scan, ZoomIn, ZoomOut } from "lucide-react";
import { ShellPortal } from "./shell/slots.js";
import { useTranslation } from "react-i18next";
import { FogPreview } from "./FogPreview.js";
import { TvFrame } from "./TvFrame.js";
import {
  brushArea,
  dragArea,
  lassoArea,
  polygonArea,
  squareEnd,
  type FogShape,
} from "./fog-shapes.js";
import { releaseVideo, type MapViewService } from "../platform/map-images.js";
import {
  arrowStep,
  dragCells,
  tapFreeShift,
  tapShift,
  tokenAt,
} from "./token-pointer.js";

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
      readonly shape: "rectangle" | "ellipse";
      readonly start: Point;
      readonly end: Point;
      /** Shift held: the ellipse is a circle (T-247). */
      readonly square?: boolean;
    }
  | { readonly kind: "brush"; readonly points: readonly Point[] }
  | { readonly kind: "lasso"; readonly points: readonly Point[] };

const NO_TOKENS: readonly TokenShape[] = [];
const NOTHING_SELECTED: ReadonlySet<string> = new Set();
/** A press that moves less than this (screen pixels) is a click or tap, not a drag. */
const TAP_PX = 6;

/** Selecting and moving tokens on the map (T-107b), with the pan tool. */
export interface TokenControl {
  readonly selected: ReadonlySet<string>;
  readonly onSelect: (ids: ReadonlySet<string>) => void;
  /**
   * Whether tokens move freely now (T-233d: the scene's grid mode and combat); Alt held moves
   * them freely anyway.
   */
  readonly free?: boolean;
  /**
   * Moves tokens: a drag, a tap on a cell, an arrow key. `free`: placed as they are, else onto
   * whole cells.
   */
  readonly onMove: (
    ids: readonly string[],
    shift: GridCell,
    free: boolean,
  ) => void;
  /** The part of `shift` the tokens can make (e.g. kept on the map), for the drag's preview. */
  readonly clampShift?: (ids: readonly string[], shift: GridCell) => GridCell;
  readonly onDelete: (ids: readonly string[]) => void;
}

/** A press on a token: dragging moves the selection, a click changes it. */
interface TokenPress {
  /** The pointer pressing; other fingers or a palm do not take the drag over. */
  readonly pointerId: number;
  readonly ids: readonly string[];
  readonly token: TokenShape;
  readonly wasSelected: boolean;
  readonly additive: boolean;
  /** Where it began, on screen and on the map. */
  readonly downAt: Point;
  readonly start: Point;
  moved: boolean;
  shift: GridCell;
  /** Freely, as decided by the last pointer event (Alt may change during a drag). */
  free: boolean;
}

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
  living,
  speed,
  coverFrom = "middle",
  onArea,
  onMapSize,
  grid = null,
  tvFrame = null,
  tokens = NO_TOKENS,
  tokenControl = null,
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
  /** The living fog (T-245); none draws the still fog. */
  readonly living?: LivingFog | undefined;
  /** How fast fog changes spread (T-246); none spreads over `fade` as before. */
  readonly speed?: FogOptions["speed"];
  /** Where hiding everything starts on a fully revealed map (T-249). */
  readonly coverFrom?: "middle" | "random";
  /** An area the DM marked with the reveal or hide tool, in map pixels. */
  readonly onArea?: (area: Polygon, tool: Exclude<MapTool, "pan">) => void;
  readonly onMapSize?: (size: Size) => void;
  /** The map's grid (sidecar calibration); its lines can be shown in this view (T-106b). */
  readonly grid?: GridCalibration | null;
  /** The tokens on the level shown, in map pixels (T-107a). */
  readonly tokens?: readonly TokenShape[];
  /** Selecting and moving tokens (T-107b); without it tokens do not react to the pointer. */
  readonly tokenControl?: TokenControl | null;
  /** The calibrated TV's view on this map (T-106c): shown as a frame the DM moves. */
  readonly tvFrame?: {
    readonly area: Size;
    readonly center: Point;
    readonly onMove: (center: Point) => void;
  } | null;
}) {
  const { t } = useTranslation();
  // Grid lines in the DM's view: on by default, switched in the dock (T-106b).
  const [showGrid, setShowGrid] = useState(true);
  const gridNow = useRef<GridCalibration | null>(null);
  gridNow.current = showGrid ? grid : null;
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
  const tokenPress = useRef<TokenPress | null>(null);
  // A press on empty map: a tap (no drag) clears the selection, or with touch moves it there.
  const emptyPress = useRef<{
    readonly pointerId: number;
    readonly at: Point;
  } | null>(null);
  // The token pressed last: a tap on a cell moves the selection so that it lands there.
  const anchorId = useRef<string | null>(null);
  // The selection's shift while it is dragged, drawn before it is applied.
  const [dragShift, setDragShift] = useState<{
    readonly ids: readonly string[];
    readonly shift: GridCell;
  } | null>(null);
  const selected = tokenControl?.selected ?? NOTHING_SELECTED;
  const shownTokens = useMemo(() => {
    const cell = grid?.cellSizePx;
    if (!dragShift || cell === undefined) return tokens;
    const ids = new Set(dragShift.ids);
    return tokens.map((token) =>
      ids.has(token.id)
        ? {
            ...token,
            x: token.x + dragShift.shift.col * cell,
            y: token.y + dragShift.shift.row * cell,
          }
        : token,
    );
  }, [tokens, dragShift, grid?.cellSizePx]);

  // Switching tools drops a half-drawn shape.
  useEffect(() => {
    setDrawing(null);
    setCorners([]);
    setHover(null);
    setPointer(null);
  }, [tool, shape]);
  const fogNow = useRef(fog);
  fogNow.current = fog;
  const fogOptions = {
    opacity: DM_FOG_OPACITY,
    softEdge,
    ...(living && { living }),
  };
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
        view.setGrid(gridNow.current);
        view.setTokens(tokensNow.current);
        let imageSize: Size;
        if (loaded instanceof HTMLVideoElement) {
          canvas.before(loaded);
          view.setVideo(loaded);
          imageSize = { width: loaded.videoWidth, height: loaded.videoHeight };
        } else {
          try {
            view.setMap(loaded);
          } catch (error) {
            // E.g. a tile of a map beyond the texture limit could not be made (T-127).
            console.error("The map could not be drawn.", error);
            setLoad("error");
            return;
          }
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

  const tokensNow = useRef(shownTokens);
  tokensNow.current = shownTokens;
  // Moves glide (T-233b: combat's snap, undo); a drag's preview follows the pointer at once,
  // and a changed grid (calibration) moves tokens with its lines, not after them.
  const dragging = dragShift !== null;
  const gridKey = grid
    ? `${String(grid.cellSizePx)},${String(grid.offsetXPx)},${String(grid.offsetYPx)}`
    : "";
  const tokensGrid = useRef(gridKey);
  useEffect(() => {
    const sameGrid = tokensGrid.current === gridKey;
    tokensGrid.current = gridKey;
    renderer.current?.setTokens(shownTokens, {
      glide: dragging || !sameGrid ? 0 : TOKEN_GLIDE_MS,
    });
  }, [shownTokens, dragging, gridKey]);

  const gridCell = grid?.cellSizePx;
  const gridX = grid?.offsetXPx;
  const gridY = grid?.offsetYPx;
  useEffect(() => {
    renderer.current?.setGrid(gridNow.current);
  }, [showGrid, gridCell, gridX, gridY]);

  // The fade duration and speed apply to the next change; changing them alone redraws nothing.
  const fadeNow = useRef(fade);
  fadeNow.current = fade;
  const speedNow = useRef(speed);
  speedNow.current = speed;
  const coverFromNow = useRef(coverFrom);
  coverFromNow.current = coverFrom;
  // The living fog by value: a new object with the same settings redraws nothing.
  const livingNow = useRef(living);
  livingNow.current = living;
  const livingKey = living
    ? [
        living.quality,
        living.cellSizePx,
        living.edge,
        living.motion,
        living.biome,
        living.strength,
      ].join()
    : "";
  useEffect(() => {
    const current = livingNow.current;
    renderer.current?.setFog(fog, {
      opacity: DM_FOG_OPACITY,
      softEdge,
      fade: fadeNow.current,
      ...(speedNow.current && { speed: speedNow.current }),
      ...(coverFromNow.current === "random" && {
        coverFrom: "random" as const,
      }),
      ...(current && { living: current }),
    });
  }, [fog, softEdge, livingKey]);

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

  const onMapPoint = (point: Point) => {
    const view = sizeNow.current;
    return camera && view ? screenToMap(camera, view, point) : null;
  };
  // A press on a token with the pan tool: selects it (Shift: adds it) and may start a drag.
  const pressToken = (event: PointerEvent, point: Point): boolean => {
    const mapPoint = onMapPoint(point);
    if (!tokenControl || !grid || !mapPoint) return false;
    const token = tokenAt(tokens, mapPoint);
    if (!token) return false;
    const wasSelected = selected.has(token.id);
    const additive = event.shiftKey;
    let ids = selected;
    if (!wasSelected) {
      ids = additive ? new Set([...selected, token.id]) : new Set([token.id]);
      tokenControl.onSelect(ids);
    }
    anchorId.current = token.id;
    tokenPress.current = {
      pointerId: event.pointerId,
      ids: [...ids],
      token,
      wasSelected,
      additive,
      downAt: point,
      start: mapPoint,
      moved: false,
      shift: { col: 0, row: 0 },
      free: tokenControl.free === true || event.altKey,
    };
    return true;
  };
  // A click on a token that was selected already: Shift takes it out, a click on the only one
  // clears the selection, else it alone stays selected.
  const clickSelected = (press: TokenPress) => {
    if (!tokenControl) return;
    const id = press.token.id;
    if (press.additive)
      tokenControl.onSelect(
        new Set([...selected].filter((each) => each !== id)),
      );
    else if (selected.size === 1) tokenControl.onSelect(NOTHING_SELECTED);
    else tokenControl.onSelect(new Set([id]));
  };
  // A tap on empty map: with touch or a pen the selection moves there (tap token, tap cell);
  // a mouse click clears it.
  const tapEmpty = (event: PointerEvent) => {
    if (!tokenControl || selected.size === 0) return;
    const mapPoint = onMapPoint(local(event));
    if (event.pointerType === "mouse" || !grid || !mapPoint) {
      tokenControl.onSelect(NOTHING_SELECTED);
      return;
    }
    const anchor =
      tokens.find(
        (token) => token.id === anchorId.current && selected.has(token.id),
      ) ?? tokens.find((token) => selected.has(token.id));
    if (!anchor) return;
    const free = tokenControl.free === true || event.altKey;
    const shift = free
      ? tapFreeShift(anchor, mapPoint, grid)
      : tapShift(anchor, mapPoint, grid);
    if (shift.col !== 0 || shift.row !== 0)
      tokenControl.onMove([...selected], shift, free);
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
    if (tool === "pan" && pressToken(event, point)) return;
    if (tool === "pan") {
      drag.current = { x: event.clientX, y: event.clientY };
      emptyPress.current = { pointerId: event.pointerId, at: point };
    } else if (shape === "brush")
      setDrawing({ kind: "brush", points: [point] });
    else if (shape === "lasso") setDrawing({ kind: "lasso", points: [point] });
    else if (shape !== "polygon")
      setDrawing({
        kind: "drag",
        shape,
        start: point,
        end: point,
        // Shift makes the ellipse a circle; a rectangle stays the box the DM sees.
        square: shape === "ellipse" && event.shiftKey,
      });
  };
  const onPointerMove = (event: PointerEvent) => {
    const point = local(event);
    const press = tokenPress.current;
    if (press && grid) {
      if (event.pointerId !== press.pointerId) return;
      if (
        !press.moved &&
        Math.hypot(point.x - press.downAt.x, point.y - press.downAt.y) <= TAP_PX
      )
        return;
      press.moved = true;
      const mapPoint = onMapPoint(point);
      if (!mapPoint) return;
      press.free = tokenControl?.free === true || event.altKey;
      const wanted = dragCells(press.start, mapPoint, grid, press.free);
      const shift = tokenControl?.clampShift?.(press.ids, wanted) ?? wanted;
      if (shift.col === press.shift.col && shift.row === press.shift.row)
        return;
      press.shift = shift;
      setDragShift({ ids: press.ids, shift });
      return;
    }
    const pressedAt = emptyPress.current;
    if (
      pressedAt &&
      Math.hypot(point.x - pressedAt.at.x, point.y - pressedAt.at.y) > TAP_PX
    )
      emptyPress.current = null;
    // Touch has no hover: the outline would only sit under the finger.
    if (brushing && event.pointerType !== "touch") setPointer(point);
    if (drawing?.kind === "drag") {
      setDrawing({
        ...drawing,
        end: point,
        square: drawing.shape === "ellipse" && event.shiftKey,
      });
      return;
    }
    if (drawing?.kind === "brush" || drawing?.kind === "lasso") {
      setDrawing({ kind: drawing.kind, points: [...drawing.points, point] });
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
  const onPointerUp = (event: PointerEvent) => {
    const press = tokenPress.current;
    if (press && event.pointerId !== press.pointerId) return;
    tokenPress.current = null;
    if (press) {
      setDragShift(null);
      if (press.moved) {
        // Alt pressed or let go after the last move counts as well.
        const mapPoint = onMapPoint(local(event));
        if (grid && mapPoint) {
          press.free = tokenControl?.free === true || event.altKey;
          const wanted = dragCells(press.start, mapPoint, grid, press.free);
          press.shift = tokenControl?.clampShift?.(press.ids, wanted) ?? wanted;
        }
        if (press.shift.col !== 0 || press.shift.row !== 0)
          tokenControl?.onMove(press.ids, press.shift, press.free);
      } else if (press.wasSelected) clickSelected(press);
      return;
    }
    if (emptyPress.current?.pointerId === event.pointerId) tapEmpty(event);
    emptyPress.current = null;
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
    } else if (done.kind === "lasso")
      mark(lassoArea(done.points, camera, view));
    else
      mark(
        dragArea(
          done.shape,
          done.start,
          done.square === true ? squareEnd(done.start, done.end) : done.end,
          camera,
          view,
          cornerRadius,
        ),
      );
  };
  const onPointerCancel = () => {
    tokenPress.current = null;
    emptyPress.current = null;
    setDragShift(null);
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
    if (tokenControl && selected.size > 0 && tool === "pan") {
      const ids = [...selected];
      if (event.key === "Escape") {
        tokenControl.onSelect(NOTHING_SELECTED);
        return;
      }
      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        tokenControl.onDelete(ids);
        return;
      }
      const view = sizeNow.current;
      // Shift + arrow keys still pan.
      const step =
        camera && view && !event.shiftKey
          ? arrowStep(event.key, camera, view)
          : null;
      if (step) {
        event.preventDefault();
        tokenControl.onMove(ids, step, tokenControl.free === true);
        return;
      }
    }
    const actions: Record<string, (current: Camera, view: Size) => Camera> = {
      "+": (current, view) => zoomAt(current, KEY_ZOOM, centre(view), view),
      "=": (current, view) => zoomAt(current, KEY_ZOOM, centre(view), view),
      "-": (current, view) => zoomAt(current, 1 / KEY_ZOOM, centre(view), view),
      ArrowLeft: (current) => panBy(current, { x: KEY_PAN, y: 0 }),
      ArrowRight: (current) => panBy(current, { x: -KEY_PAN, y: 0 }),
      ArrowUp: (current) => panBy(current, { x: 0, y: KEY_PAN }),
      ArrowDown: (current) => panBy(current, { x: 0, y: -KEY_PAN }),
      // T turns (DM decision 2026-11-22: R chooses the rectangle, T-247).
      t: (current) => rotateBy(current, 90),
      T: (current) => rotateBy(current, -90),
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
        {camera && sizeNow.current && tvFrame && grid && (
          <TvFrame
            camera={camera}
            view={sizeNow.current}
            area={tvFrame.area}
            center={tvFrame.center}
            cellSizePx={grid.cellSizePx}
            movable={tool === "pan"}
            onMove={tvFrame.onMove}
          />
        )}
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
            icon={<Grid3x3 />}
            label={t("mapView.grid")}
            pressed={showGrid}
            disabled={load !== "ready" || !grid}
            onClick={() => {
              setShowGrid((current) => !current);
            }}
          />
          <IconButton
            icon={<RotateCw />}
            label={t("mapView.rotate")}
            aria-keyshortcuts="t"
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
