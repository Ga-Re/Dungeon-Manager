// Entry point of the E2E harness (T-130a): the real DM window with in-memory platform services.
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { I18nextProvider } from "react-i18next";
import { createI18n } from "@dungeon-manager/ui";
import "@dungeon-manager/ui/styles/tokens.css";
import "@dungeon-manager/ui/styles/components.css";
import "../dm.css";
import { DmApp } from "../dm/DmApp.js";
import { MapViewContext } from "../dm/MapView.js";
import { createE2eLibrary, e2eDisplays, e2eMapView } from "./fake-platform.js";

const i18n = createI18n();
document.documentElement.lang = i18n.language;
document.title = i18n.t("app.title");
const root = document.getElementById("root");
if (!root) throw new Error("#root is missing in e2e.html");

let nextId = 0;
const library = await createE2eLibrary();

createRoot(root).render(
  <StrictMode>
    <I18nextProvider i18n={i18n}>
      <MapViewContext value={e2eMapView}>
        <DmApp
          displayService={e2eDisplays}
          libraryService={library}
          newId={() => `e2e-${String(++nextId)}`}
        />
      </MapViewContext>
    </I18nextProvider>
  </StrictMode>,
);
