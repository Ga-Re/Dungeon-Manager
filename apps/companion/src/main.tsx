import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { I18nextProvider } from "react-i18next";
import { CompanionApp } from "./CompanionApp.js";
import { createI18n } from "@dungeon-manager/ui";
import "./styles.css";

const i18n = createI18n();
document.documentElement.lang = i18n.language;
document.title = i18n.t("companion.heading");
const root = document.getElementById("root");
if (!root) throw new Error("#root is missing in index.html");

createRoot(root).render(
  <StrictMode>
    <I18nextProvider i18n={i18n}>
      <CompanionApp />
    </I18nextProvider>
  </StrictMode>,
);
