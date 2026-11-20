import { MapDataUnavailableError } from "@dungeon-manager/storage";
import { createI18n } from "@dungeon-manager/ui";
import { describe, expect, test } from "vitest";
import { describeLibraryError } from "./describe-error.js";

const t = createI18n("de").t;

describe("describeLibraryError", () => {
  test("a map whose data is not downloaded yet gets an actionable message", () => {
    expect(
      describeLibraryError(
        t,
        new MapDataUnavailableError("library/maps/a.png"),
      ),
    ).toMatch(/noch nicht heruntergeladen.*sobald dein Sync-Dienst/);
  });

  test("anything else says what went wrong", () => {
    expect(describeLibraryError(t, new Error("disk full"))).toContain(
      "disk full",
    );
  });
});
