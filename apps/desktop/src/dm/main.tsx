import {
  createTauriDisplayService,
  detectPlatformFamily,
} from "../platform/tauri-displays.js";
import { createTauriLibraryService } from "../platform/tauri-library.js";
import { createTauriMapViewService } from "../platform/tauri-map-images.js";
import { createTauriPlayerFeedSender } from "../platform/tauri-player-feed.js";
import { renderDmWindow } from "./render.js";

// SPIKE (T-007): `pnpm spike:desktop` opens the performance spike instead of the player view.
const playerPage =
  import.meta.env.VITE_SPIKE === "1" ? "spike.html" : "player.html";

renderDmWindow({
  displayService: createTauriDisplayService(
    detectPlatformFamily(navigator.userAgent),
    playerPage,
  ),
  libraryService: createTauriLibraryService(),
  mapViewService: createTauriMapViewService(),
  playerFeed: createTauriPlayerFeedSender(),
  // Lowercase UUIDs: opaque, unique, and safe as file names on every OS.
  newId: () => crypto.randomUUID(),
});
