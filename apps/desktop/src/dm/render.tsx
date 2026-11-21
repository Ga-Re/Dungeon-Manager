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
import "../player-view.css";
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
  /**
   * Whether the previous session was killed or crashed, as the platform knows it (T-238: the
   * desktop backend's marker file). Without it (E2E harness), a marker in device storage is used.
   */
  readonly previousSessionCrashed?: () => Promise<boolean>;
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
  const mount = (afterCrash: boolean) => {
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
  };

  // Once per window, outside React (StrictMode would run an initialiser twice).
  const { previousSessionCrashed } = services;
  if (previousSessionCrashed) {
    previousSessionCrashed()
      .then(mount, (error: unknown) => {
        // Not known: like after a crash, the TV stays dark until the DM sends a scene.
        console.error(
          "Whether the last session ended cleanly is unknown.",
          error,
        );
        mount(true);
      })
      .catch((error: unknown) => {
        console.error("The DM window could not be set up.", error);
      });
    return;
  }
  // Without the backend: a marker in device storage, cleared when the page goes (T-114a).
  const afterCrash = startSession(deviceStorage());
  const endClean = () => {
    endSession(deviceStorage());
  };
  window.addEventListener("pagehide", endClean);
  window.addEventListener("beforeunload", endClean);
  mount(afterCrash);
}
