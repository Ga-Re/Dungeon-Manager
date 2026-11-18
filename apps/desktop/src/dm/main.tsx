import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { I18nextProvider } from "react-i18next";
import { createI18n } from "@dungeon-manager/ui";
import {
  createTauriDisplayService,
  detectPlatformFamily,
} from "../platform/tauri-displays.js";
import { createTauriLibraryService } from "../platform/tauri-library.js";
import { createTauriMapViewService } from "../platform/tauri-map-images.js";
import { createTauriPlayerFeedSender } from "../platform/tauri-player-feed.js";
import "@dungeon-manager/ui/styles/tokens.css";
import "@dungeon-manager/ui/styles/components.css";
import "../dm.css";
import { DmApp } from "./DmApp.js";
import { MapViewContext } from "./MapView.js";
import { PlayerFeedContext } from "./player-feed-context.js";

const i18n = createI18n();
// SPIKE (T-007): `pnpm spike:desktop` opens the performance spike instead of the player view.
const playerPage =
  import.meta.env.VITE_SPIKE === "1" ? "spike.html" : "player.html";
const displayService = createTauriDisplayService(
  detectPlatformFamily(navigator.userAgent),
  playerPage,
);
document.documentElement.lang = i18n.language;
document.title = i18n.t("app.title");
const root = document.getElementById("root");
if (!root) throw new Error("#root is missing in dm.html");

createRoot(root).render(
  <StrictMode>
    <I18nextProvider i18n={i18n}>
      <PlayerFeedContext value={createTauriPlayerFeedSender()}>
        <MapViewContext value={createTauriMapViewService()}>
          <DmApp
            displayService={displayService}
            libraryService={createTauriLibraryService()}
            // Lowercase UUIDs: opaque, unique, and safe as file names on every OS.
            newId={() => crypto.randomUUID()}
          />
        </MapViewContext>
      </PlayerFeedContext>
    </I18nextProvider>
  </StrictMode>,
);
