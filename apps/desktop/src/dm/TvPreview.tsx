import { useMemo } from "react";
import { PlayerApp } from "../player/PlayerApp.js";
import type { MapViewService } from "../platform/map-images.js";
import type {
  PlayerFeedReceiver,
  PlayerFeedSender,
} from "../platform/player-feed.js";

/**
 * The TV preview in the DM window (T-113b): the player view, drawn from exactly the messages the
 * TV is sent (`watch`), so it can never show more than the players – blackout included. A scale
 * model of the chosen TV, in its shape.
 */
export function TvPreview({
  feed,
  maps,
  tv,
}: {
  readonly feed: PlayerFeedSender;
  readonly maps: MapViewService;
  /** The TV's size in physical pixels. */
  readonly tv: { readonly width: number; readonly height: number };
}) {
  const watched = useMemo<PlayerFeedReceiver>(
    () => ({
      subscribe: (listener) => Promise.resolve(feed.watch(listener)),
    }),
    [feed],
  );
  return (
    <div
      className="dm-tv-preview"
      style={{ aspectRatio: `${String(tv.width)} / ${String(tv.height)}` }}
    >
      <PlayerApp
        feed={watched}
        maps={maps}
        embedded={{ tvWidthPx: tv.width }}
      />
    </div>
  );
}
