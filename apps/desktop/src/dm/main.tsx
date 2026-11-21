import {
  createTauriDisplayService,
  detectPlatformFamily,
} from "../platform/tauri-displays.js";
import { createTauriLibraryService } from "../platform/tauri-library.js";
import { createTauriAppMenu } from "../platform/tauri-app-menu.js";
import { createTauriMapViewService } from "../platform/tauri-map-images.js";
import { createTauriPlayerFeedSender } from "../platform/tauri-player-feed.js";
import { tauriPreviousSessionCrashed } from "../platform/tauri-session.js";
import { renderDmWindow } from "./render.js";

// `pnpm bench` opens the renderer benchmark (T-105d) instead of the player view.
const playerPage =
  import.meta.env.VITE_BENCH === "1" ? "bench.html" : "player.html";

const platform = detectPlatformFamily(navigator.userAgent);

renderDmWindow({
  displayService: createTauriDisplayService(platform, playerPage),
  appMenu: createTauriAppMenu(platform),
  libraryService: createTauriLibraryService(),
  mapViewService: createTauriMapViewService(),
  playerFeed: createTauriPlayerFeedSender(),
  // Lowercase UUIDs: opaque, unique, and safe as file names on every OS.
  newId: () => crypto.randomUUID(),
  previousSessionCrashed: tauriPreviousSessionCrashed,
});
