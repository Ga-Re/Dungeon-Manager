import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { I18nextProvider } from "react-i18next";
import { createI18n } from "../i18n.js";
import "../styles.css";
import { PlayerApp } from "./PlayerApp.js";

const i18n = createI18n();
document.documentElement.lang = i18n.language;
document.title = i18n.t("player.windowTitle");
const root = document.getElementById("root");
if (!root) throw new Error("#root is missing in player.html");

createRoot(root).render(
  <StrictMode>
    <I18nextProvider i18n={i18n}>
      <PlayerApp />
    </I18nextProvider>
  </StrictMode>,
);
