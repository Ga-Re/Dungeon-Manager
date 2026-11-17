import {
  PLAYER_VIEW_VERSION,
  parsePlayerViewMessage,
  type PlayerViewMessage,
} from "@dungeon-manager/protocol";
import { emitTo, listen } from "@tauri-apps/api/event";
import {
  createPlayerFeedSender,
  type PlayerFeedReceiver,
  type PlayerFeedSender,
} from "./player-feed.js";

/** Event carrying a `PlayerViewMessage` from the DM window to the player window. */
const VIEW_EVENT = "player-view";
/** Emitted by the backend to the DM window when the player window has loaded (lib.rs). */
const READY_EVENT = "player-ready";

/** DM window: sends to the player window only (`emitTo`), never to all windows. */
export function createTauriPlayerFeedSender(): PlayerFeedSender {
  return createPlayerFeedSender(
    (message) => {
      void emitTo("player", VIEW_EVENT, message);
    },
    (callback) => {
      void listen(READY_EVENT, () => {
        // "Loaded" fires at the page's load event, possibly just before the player window has
        // subscribed; the state is idempotent, so it is simply sent again a moment later.
        callback();
        setTimeout(callback, RESEND_DELAY_MS);
      });
    },
  );
}

const RESEND_DELAY_MS = 1000;

/**
 * Player window: listening is its only permission. Every message is validated with the strict
 * player-view schema; an invalid one blanks the TV, so a malformed message can never show data.
 */
export function createTauriPlayerFeedReceiver(): PlayerFeedReceiver {
  // Subscribed at once (not when React mounts), so no message sent right after loading is
  // missed; the latest one is replayed to each subscriber.
  let latest: PlayerViewMessage | null = null;
  const listeners = new Set<(message: PlayerViewMessage) => void>();
  void listen<unknown>(VIEW_EVENT, ({ payload }) => {
    // Fail closed: an invalid message (e.g. from a newer app version) blanks the TV instead of
    // leaving the last picture up, which might show areas the DM has hidden since.
    let message = parsePlayerViewMessage(payload);
    if (!message) {
      console.warn("Invalid player-view message: the TV shows nothing.");
      message = {
        v: PLAYER_VIEW_VERSION,
        scene: null,
        rotation: latest?.rotation ?? 0,
      };
    }
    latest = message;
    listeners.forEach((listener) => {
      listener(message);
    });
  });
  return {
    subscribe(listener) {
      listeners.add(listener);
      if (latest) listener(latest);
      return Promise.resolve(() => {
        listeners.delete(listener);
      });
    },
  };
}
