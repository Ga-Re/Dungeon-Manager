import { describe, expect, test } from "vitest";
import { DEFAULT_LANGUAGE, LANGUAGES, resources } from "./index.js";

/** All dotted key paths of a nested message object. */
function keyPaths(messages: object, prefix = ""): string[] {
  return Object.entries(messages as Record<string, unknown>).flatMap(
    ([key, value]) =>
      typeof value === "object" && value !== null
        ? keyPaths(value, `${prefix}${key}.`)
        : [`${prefix}${key}`],
  );
}

describe("i18n resources", () => {
  test("German is the default language", () => {
    expect(DEFAULT_LANGUAGE).toBe("de");
  });

  test("every language provides exactly the German keys", () => {
    const german = keyPaths(resources.de.translation).sort();
    for (const language of LANGUAGES) {
      expect(keyPaths(resources[language].translation).sort()).toEqual(german);
    }
  });

  test("no message is empty", () => {
    for (const language of LANGUAGES) {
      const translation: object = resources[language].translation;
      for (const path of keyPaths(translation)) {
        const value = path
          .split(".")
          .reduce<unknown>(
            (node, key) => (node as Record<string, unknown>)[key],
            translation,
          );
        expect(value, `${language}: ${path}`).not.toBe("");
      }
    }
  });
});
