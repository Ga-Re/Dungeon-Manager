import {
  createTauriDisplayService,
  detectPlatformFamily,
} from "../platform/tauri-displays.js";
import { createTauriLibraryService } from "../platform/tauri-library.js";
import { createTauriAppMenu } from "../platform/tauri-app-menu.js";
import { createTauriMapViewService } from "../platform/tauri-map-images.js";
import { createTauriPlayerFeedSender } from "../platform/tauri-player-feed.js";
import { renderDmWindow } from "./render.js";

// SPIKE (T-007): `pnpm spike:desktop` opens the performance spike instead of the player view.
const playerPage =
  import.meta.env.VITE_SPIKE === "1" ? "spike.html" : "player.html";

const platform = detectPlatformFamily(navigator.userAgent);

renderDmWindow({
  displayService: createTauriDisplayService(platform, playerPage),
  appMenu: createTauriAppMenu(platform),
  libraryService: createTauriLibraryService(),
  mapViewService: createTauriMapViewService(),
  playerFeed: createTauriPlayerFeedSender(),
  // Lowercase UUIDs: opaque, unique, and safe as file names on every OS.
  newId: () => crypto.randomUUID(),
});
