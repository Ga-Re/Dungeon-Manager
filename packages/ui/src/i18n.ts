import {
  DEFAULT_LANGUAGE,
  resources,
  type Language,
} from "@dungeon-manager/i18n";
import i18next, { type i18n } from "i18next";
import { initReactI18next } from "react-i18next";

/** Creates an initialised i18next instance; resources are bundled, so this is synchronous. */
export function createI18n(language: Language = DEFAULT_LANGUAGE): i18n {
  const instance = i18next.createInstance();
  void instance.use(initReactI18next).init({
    resources,
    lng: language,
    fallbackLng: DEFAULT_LANGUAGE,
    initAsync: false,
    // React already escapes rendered text.
    interpolation: { escapeValue: false },
  });
  return instance;
}
