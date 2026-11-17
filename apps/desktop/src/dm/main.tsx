import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { I18nextProvider } from "react-i18next";
import { createI18n } from "../i18n.js";
import { createTauriDisplayService } from "../platform/tauri-displays.js";
import "../styles.css";
import { DmApp } from "./DmApp.js";

const i18n = createI18n();
document.title = i18n.t("app.title");
const root = document.getElementById("root");
if (!root) throw new Error("#root is missing in dm.html");

createRoot(root).render(
  <StrictMode>
    <I18nextProvider i18n={i18n}>
      <DmApp displayService={createTauriDisplayService()} />
    </I18nextProvider>
  </StrictMode>,
);
