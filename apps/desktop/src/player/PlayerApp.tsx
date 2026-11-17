import type { PlayerViewMessage } from "@dungeon-manager/protocol";
import { fitCamera, type Renderer, type Size } from "@dungeon-manager/renderer";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import type { MapViewService } from "../platform/map-images.js";
import type { PlayerFeedReceiver } from "../platform/player-feed.js";

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
}: {
  readonly feed: PlayerFeedReceiver;
  readonly maps: MapViewService;
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
    let loading = 0;
    const canvas = document.createElement("canvas");
    element.appendChild(canvas);

    // What is on screen, for the desktop smoke test (nothing that is not on the TV anyway).
    const mark = (showing: "none" | "map") => {
      element.dataset["showing"] = showing;
    };
    mark("none");

    const fit = () => {
      if (renderer && mapSize && message) {
        renderer.setCamera(fitCamera(mapSize, windowSize(), message.rotation));
      }
    };

    const show = (next: PlayerViewMessage) => {
      const previousPath = message?.scene?.map?.asset.path;
      message = next;
      const view = renderer;
      if (!view) return;
      const map = next.scene?.map ?? null;
      const level = map?.levels[0]?.id;
      // Fog first: everything not revealed on the shown level stays covered.
      view.setFog(
        level === undefined ? [] : (next.scene?.fog[level]?.revealed ?? []),
      );
      if (!map) {
        mapSize = null;
        view.setMap(null);
        mark("none");
        return;
      }
      if (map.asset.path === previousPath && mapSize) {
        fit();
        return;
      }
      // A different map: remove the old one at once, then load the new one.
      view.setMap(null);
      mark("none");
      mapSize = null;
      const request = ++loading;
      maps.loadImage(map.asset.path).then(
        (image) => {
          if (!active || request !== loading) return;
          mapSize = { width: image.width, height: image.height };
          view.setMap(image);
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
      window.removeEventListener("resize", onResize);
      void unsubscribe.then((stop) => {
        stop();
      });
      void rendererReady.then(() => {
        renderer?.destroy();
        renderer = null;
      });
      canvas.remove();
    };
  }, [feed, maps]);

  return (
    <main
      ref={host}
      id="player-view"
      className="player"
      aria-label={t("player.windowTitle")}
    />
  );
}
