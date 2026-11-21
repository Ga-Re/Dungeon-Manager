import { parsePlayerViewMessage } from "@dungeon-manager/protocol";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { PlayerApp } from "../player/PlayerApp.js";
import type { MapViewService } from "../platform/map-images.js";
import type {
  PlayerFeedReceiver,
  PlayerFeedSender,
} from "../platform/player-feed.js";

/**
 * The TV preview in the DM window (T-113b): the player view, drawn from exactly the messages the
 * TV is sent (`watch`), checked like the TV checks them, so it can never show more than the
 * players – blackout included. A scale model of the chosen TV, in its shape. It runs only while
 * its panel shows: a hidden tab costs no renderer and no video (on showing, `watch` hands it the
 * latest state at once).
 */
export function TvPreview({
  feed,
  maps,
  tv,
}: {
  readonly feed: PlayerFeedSender;
  readonly maps: MapViewService;
  /** The TV's size in physical pixels; `null` while no TV is chosen (a 1920 × 1080 model). */
  readonly tv: { readonly width: number; readonly height: number } | null;
}) {
  const { t } = useTranslation();
  const box = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(typeof ResizeObserver === "undefined");
  useEffect(() => {
    const element = box.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const measure = () => {
      setShown(element.clientWidth > 0 && element.clientHeight > 0);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, []);
  const watched = useMemo<PlayerFeedReceiver>(
    () => ({
      subscribe: (listener) =>
        Promise.resolve(
          feed.watch((message) => {
            // The TV drops a message its schema refuses; so does its preview.
            const checked = parsePlayerViewMessage(message);
            if (checked) listener(checked);
          }),
        ),
    }),
    [feed],
  );
  const model = tv ?? { width: 1920, height: 1080 };
  return (
    <div className="dm-tv-preview-panel">
      {!tv && <p className="dm-settings-hint">{t("dm.previewNoTv")}</p>}
      <div
        ref={box}
        className="dm-tv-preview"
        style={{
          // As wide as the panel allows in the TV's shape (also in a wide, short panel).
          width: `min(100cqw, calc(100cqh * ${String(model.width / model.height)}))`,
          aspectRatio: `${String(model.width)} / ${String(model.height)}`,
        }}
      >
        {shown && (
          <PlayerApp
            feed={watched}
            maps={maps}
            embedded={{ tvWidthPx: model.width }}
          />
        )}
      </div>
    </div>
  );
}
