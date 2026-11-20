import type { PlayerViewMessage } from "@dungeon-manager/protocol";
import {
  fitCamera,
  inchCamera,
  type Renderer,
  type Size,
} from "@dungeon-manager/renderer";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { levelMedia } from "../level-media.js";
import { releaseVideo, type MapViewService } from "../platform/map-images.js";
import type { PlayerFeedReceiver } from "../platform/player-feed.js";
import {
  onFogLookChange,
  readFogLook,
  softEdgeWidth,
} from "../fog-settings.js";
import { deviceStorage } from "../dm/shell/theme.js";

type ShownMap = NonNullable<NonNullable<PlayerViewMessage["scene"]>["map"]>;

/** The file shown for the TV's level (T-118a), with its own kind (T-118c). */
const mediaOf = (map: ShownMap | null | undefined) =>
  map ? levelMedia(map, map.currentLevelId) : null;

const windowSize = (): Size => ({
  width: window.innerWidth,
  height: window.innerHeight,
});

/**
 * Player window (table TV): fullscreen, no controls (SPEC 2.2). It shows only what the DM
 * window sends – a projected scene – and covers everything but the revealed areas with fog.
 * Fail closed: until a valid scene arrives, and while a map loads, the screen is black.
 */
export function PlayerApp({
  feed,
  maps,
  storage = deviceStorage(),
}: {
  readonly feed: PlayerFeedReceiver;
  readonly maps: MapViewService;
  /** Device-local settings (soft fog edges), shared with the DM window. */
  readonly storage?: Storage | undefined;
}) {
  const { t } = useTranslation();
  const host = useRef<HTMLElement>(null);

  useEffect(() => {
    const element = host.current;
    if (!element) return;
    let active = true;
    let renderer: Renderer | null = null;
    let message: PlayerViewMessage | null = null;
    let mapSize: Size | null = null;
    let video: HTMLVideoElement | null = null;
    let look = readFogLook(storage);
    // Removes the current map, image or video, at once.
    const clearMap = (view: Renderer) => {
      view.setMap(null);
      view.setVideo(null);
      releaseVideo(video);
      video = null;
    };
    let loading = 0;
    const canvas = document.createElement("canvas");
    element.appendChild(canvas);

    // What is on screen, for the desktop smoke test (nothing that is not on the TV anyway).
    const mark = (showing: "none" | "map") => {
      element.dataset["showing"] = showing;
    };
    mark("none");

    // A square of a known number of pixels for the DM to measure (T-106d).
    const checkSquare = document.createElement("div");
    checkSquare.className = "player-check-square";
    // Black until the first message (fail closed): no square before the DM asks for one.
    checkSquare.hidden = true;
    element.appendChild(checkSquare);
    const showCheckSquare = () => {
      const sidePx = message?.checkSquarePx;
      checkSquare.hidden = sidePx === undefined;
      if (sidePx === undefined) return;
      // The page works in CSS pixels; the square is given in physical ones.
      const side = sidePx / window.devicePixelRatio;
      checkSquare.style.width = `${String(side)}px`;
      checkSquare.style.height = `${String(side)}px`;
    };

    const fit = () => {
      showCheckSquare();
      if (renderer && mapSize && message) {
        const scale = message.scale;
        const cellSizePx = message.scene?.map?.grid.cellSizePx;
        // Calibrated: one cell has the DM's size on the table (T-106a); else the whole map fits.
        renderer.setCamera(
          scale && cellSizePx !== undefined
            ? inchCamera(
                mapSize,
                message.rotation,
                cellSizePx,
                (scale.inchPx * scale.cellInches) / window.devicePixelRatio,
              )
            : fitCamera(mapSize, windowSize(), message.rotation),
        );
      }
    };

    // `fades`: the change happens within the same scene and map (never for a new one).
    const applyFog = (
      view: Renderer,
      shown: PlayerViewMessage,
      fades: boolean,
    ) => {
      const map = shown.scene?.map ?? null;
      const level = map?.currentLevelId;
      view.setFog(
        level === undefined ? [] : (shown.scene?.fog[level]?.revealed ?? []),
        {
          softEdge: map
            ? softEdgeWidth(map.grid.cellSizePx, look.softEdges)
            : 0,
          fade: fades ? look.fadeSeconds * 1000 : 0,
        },
      );
    };
    // The DM changed the fog's look in the settings: redraw the fog as it is.
    const stopSettings = onFogLookChange(storage, (next) => {
      look = next;
      if (renderer && message) applyFog(renderer, message, true);
    });

    const show = (next: PlayerViewMessage) => {
      const previousPath = mediaOf(message?.scene?.map)?.path;
      const media = mediaOf(next.scene?.map);
      // Another level is another floor: its fog appears at once, like a new scene's.
      const sameScene =
        message?.scene != null &&
        message.scene.id === next.scene?.id &&
        previousPath === media?.path &&
        message.scene.map?.currentLevelId === next.scene.map?.currentLevelId;
      message = next;
      const view = renderer;
      if (!view) return;
      const map = next.scene?.map ?? null;
      showCheckSquare();
      // Grid lines only when the DM switched them on for the TV (T-106b); under the fog.
      view.setGrid(map && next.showGrid === true ? map.grid : null);
      // Fog first: everything not revealed on the shown level stays covered.
      applyFog(view, next, sameScene);
      if (!map || !media) {
        // Also cancels a map still loading for the previous scene.
        loading++;
        mapSize = null;
        clearMap(view);
        mark("none");
        return;
      }
      if (media.path === previousPath && mapSize) {
        fit();
        return;
      }
      // A different map: remove the old one at once, then load the new one.
      clearMap(view);
      mark("none");
      mapSize = null;
      const request = ++loading;
      const loaded =
        media.kind === "video"
          ? maps.loadVideo(media.path)
          : maps.loadImage(media.path);
      loaded.then(
        (shown) => {
          if (!active || request !== loading) {
            if (shown instanceof HTMLVideoElement) releaseVideo(shown);
            return;
          }
          if (shown instanceof HTMLVideoElement) {
            // Under the canvas; the renderer shows it only once the fog is drawn (ADR-0010).
            video = shown;
            canvas.before(shown);
            mapSize = { width: shown.videoWidth, height: shown.videoHeight };
            view.setVideo(shown);
          } else {
            mapSize = { width: shown.width, height: shown.height };
            view.setMap(shown);
          }
          mark("map");
          fit();
        },
        () => {
          // Nothing to show; the fog already covers everything.
        },
      );
    };

    const rendererReady = maps
      .createRenderer(canvas, windowSize())
      .then((created) => {
        if (!active) {
          created.destroy();
          return;
        }
        renderer = created;
        created.setFog([]);
        if (message) {
          const pending = message;
          message = null;
          show(pending);
        }
      })
      .catch((error: unknown) => {
        // No WebGL, for instance: the screen stays black, which is the safe state.
        console.error("The player view could not start its renderer.", error);
      });
    const unsubscribe = feed.subscribe((next) => {
      show(next);
    });
    const onResize = () => {
      renderer?.resize(windowSize());
      fit();
    };
    window.addEventListener("resize", onResize);

    return () => {
      active = false;
      stopSettings();
      window.removeEventListener("resize", onResize);
      void unsubscribe.then((stop) => {
        stop();
      });
      void rendererReady.then(() => {
        renderer?.destroy();
        renderer = null;
      });
      canvas.remove();
      checkSquare.remove();
      releaseVideo(video);
    };
  }, [feed, maps, storage]);

  return (
    <main
      ref={host}
      id="player-view"
      className="player"
      aria-label={t("player.windowTitle")}
    />
  );
}
