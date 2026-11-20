import {
  PLAYER_VIEW_VERSION,
  type PlayerViewMessage,
  type PlayerViewScale,
} from "@dungeon-manager/protocol";
import type { ViewerScene } from "@dungeon-manager/schema";

export type TvRotation = PlayerViewMessage["rotation"];

/**
 * DM side of the player feed: what the table TV shows. Only projected scenes go in
 * (`projectForViewer`), so hidden data never reaches the player window (ARCHITECTURE §5.1).
 */
export interface PlayerFeedSender {
  /** Shows a projected scene on the TV, or nothing (`null`). */
  show(scene: ViewerScene | null): void;
  rotate(rotation: TvRotation): void;
  readonly rotation: TvRotation;
  /** The TV's calibration (T-106a), or `null`: the whole map fits the TV. */
  calibrate(scale: PlayerViewScale | null): void;
  /** Shows a check square of `sidePx` physical pixels on the TV to measure, or hides it (T-106d). */
  showCheckSquare(sidePx: number | null): void;
}

/** Player side: calls `listener` with every valid message; invalid ones are dropped. */
export interface PlayerFeedReceiver {
  subscribe(
    listener: (message: PlayerViewMessage) => void,
  ): Promise<() => void>;
}

/**
 * The sender's logic, independent of Tauri: it keeps the latest state and sends it on every
 * change and whenever the player window (re)loads, so a TV opened later is never stale.
 * @param send delivers a message to the player window
 * @param onPlayerReady registers a callback for "the player window has loaded"
 */
export function createPlayerFeedSender(
  send: (message: PlayerViewMessage) => void,
  onPlayerReady: (callback: () => void) => void,
): PlayerFeedSender {
  let scene: ViewerScene | null = null;
  let rotation: TvRotation = 0;
  let scale: PlayerViewScale | null = null;
  let checkSquarePx: number | null = null;
  const publish = () => {
    send({
      v: PLAYER_VIEW_VERSION,
      scene,
      rotation,
      ...(scale && { scale }),
      ...(checkSquarePx !== null && { checkSquarePx }),
    });
  };
  onPlayerReady(publish);
  return {
    show(next) {
      scene = next;
      publish();
    },
    rotate(next) {
      rotation = next;
      publish();
    },
    get rotation() {
      return rotation;
    },
    calibrate(next) {
      scale = next;
      publish();
    },
    showCheckSquare(next) {
      checkSquarePx = next;
      publish();
    },
  };
}
