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
import "@dungeon-manager/ui/styles/tokens.css";
import "@dungeon-manager/ui/styles/components.css";
import "../dm.css";
import { DmApp } from "./DmApp.js";
import { MapViewContext } from "./MapView.js";
import { PlayerFeedContext } from "./player-feed-context.js";
import { applyTheme, readThemeSetting } from "./shell/theme.js";

/** Platform services the DM window runs on. */
export interface DmWindowServices {
  readonly displayService: DisplayService;
  readonly libraryService: LibraryService;
  readonly mapViewService: MapViewService;
  readonly playerFeed: PlayerFeedSender | null;
  readonly newId: () => string;
}

/** Renders the DM window into `#root`. */
export function renderDmWindow(services: DmWindowServices): void {
  const i18n = createI18n();
  const documentRoot = document.documentElement;
  documentRoot.lang = i18n.language;
  document.title = i18n.t("app.title");
  // Before the first paint, so a dark-theme DM never sees a parchment flash.
  applyTheme(readThemeSetting(globalThis.localStorage), documentRoot);
  const root = document.getElementById("root");
  if (!root) throw new Error("#root is missing");

  createRoot(root).render(
    <StrictMode>
      <I18nextProvider i18n={i18n}>
        <PlayerFeedContext value={services.playerFeed}>
          <MapViewContext value={services.mapViewService}>
            <DmApp
              displayService={services.displayService}
              libraryService={services.libraryService}
              newId={services.newId}
            />
          </MapViewContext>
        </PlayerFeedContext>
      </I18nextProvider>
    </StrictMode>,
  );
}
