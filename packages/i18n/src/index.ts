import { de } from "./locales/de.js";
import { en } from "./locales/en.js";

export type { Messages } from "./locales/de.js";

/** Languages the UI ships with. German is the primary language (ADR-0008). */
export const LANGUAGES = ["de", "en"] as const;

/** A supported UI language. */
export type Language = (typeof LANGUAGES)[number];

/** Language used when nothing else is configured. */
export const DEFAULT_LANGUAGE: Language = "de";

/** i18next resources for every supported language, under the default `translation` namespace. */
export const resources = {
  de: { translation: de },
  en: { translation: en },
} as const;
