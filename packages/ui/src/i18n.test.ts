import { DEFAULT_LANGUAGE, resources } from "@dungeon-manager/i18n";
import { describe, expect, it } from "vitest";
import { createI18n } from "./i18n.js";

describe("createI18n", () => {
  it("starts in German by default and is ready synchronously", () => {
    const i18n = createI18n();

    expect(i18n.language).toBe(DEFAULT_LANGUAGE);
    expect(i18n.isInitialized).toBe(true);
    expect(i18n.t("app.title")).toBe(resources.de.translation.app.title);
  });

  it("uses the requested language", () => {
    const i18n = createI18n("en");

    expect(i18n.language).toBe("en");
    expect(i18n.t("app.title")).toBe(resources.en.translation.app.title);
  });

  it("returns independent instances", () => {
    const first = createI18n();
    const second = createI18n();

    void second.changeLanguage("en");

    expect(first.language).toBe(DEFAULT_LANGUAGE);
    expect(second.language).toBe("en");
  });

  it("does not escape interpolated values (React escapes rendered text)", () => {
    const i18n = createI18n();

    expect(
      i18n.t("test.greeting", { defaultValue: "Hallo {{name}}", name: "<b>" }),
    ).toBe("Hallo <b>");
  });
});
