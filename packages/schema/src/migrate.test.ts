import { describe, expect, test } from "vitest";
import { z } from "zod";
import { MigrationError, migrateDocument, type Migration } from "./index.js";

// A fake document type: v0 stored `title`, v1 renamed it to `name` and added `schemaVersion`.
const fakeV1 = z.looseObject({ schemaVersion: z.literal(1), name: z.string() });

const v0ToV1: Migration = {
  from: 0,
  migrate: (doc) => {
    const { title, ...rest } = doc;
    return { ...rest, schemaVersion: 1, name: title };
  },
};

const fakeDocument = { schema: fakeV1, latestVersion: 1, migrations: [v0ToV1] };

describe("migrateDocument", () => {
  test("migrates a v0 document (no schemaVersion) to v1", () => {
    const result = migrateDocument({ title: "Alt", keep: true }, fakeDocument);

    expect(result).toEqual({ schemaVersion: 1, name: "Alt", keep: true });
  });

  test("leaves a current document unchanged", () => {
    const current = { schemaVersion: 1, name: "Neu" };

    expect(migrateDocument(current, fakeDocument)).toEqual(current);
  });

  test("refuses documents written by a newer app version instead of losing data", () => {
    expect(() =>
      migrateDocument({ schemaVersion: 2, name: "Zukunft" }, fakeDocument),
    ).toThrow(new MigrationError("newerVersion", 2));
  });

  test("reports a missing migration step", () => {
    const withoutSteps = { ...fakeDocument, migrations: [] };

    expect(() => migrateDocument({ title: "Alt" }, withoutSteps)).toThrow(
      new MigrationError("missingMigration", 0),
    );
  });

  test("reports content that is not a document", () => {
    expect(() => migrateDocument([1, 2], fakeDocument)).toThrow(
      new MigrationError("notAnObject", null),
    );
    expect(() => migrateDocument({ schemaVersion: "1" }, fakeDocument)).toThrow(
      new MigrationError("invalidVersion", null),
    );
  });

  test("rejects a migration that does not raise the version by exactly one (no endless loop)", () => {
    const stuck: Migration = { from: 0, migrate: (doc) => doc };
    const skipping: Migration = {
      from: 0,
      migrate: (doc) => ({ ...doc, schemaVersion: 2 }),
    };
    const twoStepType = { ...fakeDocument, latestVersion: 2 };

    expect(() =>
      migrateDocument(
        { title: "Alt" },
        { ...fakeDocument, migrations: [stuck] },
      ),
    ).toThrow(new MigrationError("invalidMigration", 0));
    expect(() =>
      migrateDocument(
        { title: "Alt" },
        { ...twoStepType, migrations: [skipping] },
      ),
    ).toThrow(new MigrationError("invalidMigration", 0));
  });

  test("rejects two migrations for the same version", () => {
    expect(() =>
      migrateDocument(
        { title: "Alt" },
        { ...fakeDocument, migrations: [v0ToV1, v0ToV1] },
      ),
    ).toThrow(new MigrationError("invalidMigration", 0));
  });

  test("does not change the caller's object", () => {
    const original = { title: "Alt" };
    const mutating: Migration = {
      from: 0,
      migrate: (doc) => {
        doc["schemaVersion"] = 1;
        doc["name"] = doc["title"];
        return doc;
      },
    };

    migrateDocument(original, { ...fakeDocument, migrations: [mutating] });

    expect(original).toEqual({ title: "Alt" });
  });

  test("treats a null version as corruption, not as version 0", () => {
    expect(() =>
      migrateDocument({ schemaVersion: null, title: "Alt" }, fakeDocument),
    ).toThrow(new MigrationError("invalidVersion", null));
  });

  test("validates the migrated result against the latest schema", () => {
    const broken: Migration = {
      from: 0,
      migrate: (doc) => ({ ...doc, schemaVersion: 1 }),
    };

    expect(() =>
      migrateDocument(
        { title: "Alt" },
        { ...fakeDocument, migrations: [broken] },
      ),
    ).toThrow(z.ZodError);
  });
});
