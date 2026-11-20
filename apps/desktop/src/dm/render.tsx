// Mounts the DM window. Shared by the app (`main.tsx`) and the E2E harness (`e2e/main.tsx`),
// so both always run the same provider tree, styles and start-up steps.
import { createI18n } from "@dungeon-manager/ui";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { I18nextProvider } from "react-i18next";
import type { DisplayService } from "../platform/displays.js";
import type { LibraryService } from "../platform/library.js";
import type { MapViewService } from "../platform/map-images.js";
import type { PlayerFeedSender } from "../platform/player-feed.js";
import type { AppMenuService } from "../platform/app-menu.js";
import "@dungeon-manager/ui/styles/tokens.css";
import "@dungeon-manager/ui/styles/components.css";
import "../dm.css";
import { DmApp } from "./DmApp.js";
import { endSession, startSession } from "./crash-marker.js";
import { MapViewContext } from "./MapView.js";
import { PlayerFeedContext } from "./player-feed-context.js";
import { applyTheme, deviceStorage, readThemeSetting } from "./shell/theme.js";
import { applyUiScale, readUiScale } from "./shell/ui-scale.js";

/** Platform services the DM window runs on. */
export interface DmWindowServices {
  readonly displayService: DisplayService;
  readonly libraryService: LibraryService;
  readonly mapViewService: MapViewService;
  readonly playerFeed: PlayerFeedSender | null;
  readonly newId: () => string;
  /** The native menu bar; the E2E harness has none and shows the menu button. */
  readonly appMenu?: AppMenuService;
}

/** Renders the DM window into `#root`. */
export function renderDmWindow(services: DmWindowServices): void {
  const i18n = createI18n();
  const documentRoot = document.documentElement;
  documentRoot.lang = i18n.language;
  document.title = i18n.t("app.title");
  // Before React renders, so the first frame of the UI already has the DM's theme.
  applyTheme(readThemeSetting(deviceStorage()), documentRoot);
  applyUiScale(readUiScale(deviceStorage()), documentRoot);
  const root = document.getElementById("root");
  if (!root) throw new Error("#root is missing");
  // Once per window, outside React (StrictMode would run an initialiser twice): a session
  // still marked as running was killed or crashed (T-114a).
  const afterCrash = startSession(deviceStorage());
  const endClean = () => {
    endSession(deviceStorage());
  };
  window.addEventListener("pagehide", endClean);
  window.addEventListener("beforeunload", endClean);

  createRoot(root).render(
    <StrictMode>
      <I18nextProvider i18n={i18n}>
        <PlayerFeedContext value={services.playerFeed}>
          <MapViewContext value={services.mapViewService}>
            <DmApp
              displayService={services.displayService}
              libraryService={services.libraryService}
              newId={services.newId}
              appMenu={services.appMenu}
              afterCrash={afterCrash}
            />
          </MapViewContext>
        </PlayerFeedContext>
      </I18nextProvider>
    </StrictMode>,
  );
}
