import type { ZodType } from "zod";

/** A raw JSON object as read from a file, before validation. */
export type RawDocument = Record<string, unknown>;

/** One step that turns a document of version `from` into version `from + 1`. */
export interface Migration {
  readonly from: number;
  readonly migrate: (document: RawDocument) => RawDocument;
}

/** How to read one kind of document: its latest schema and the steps to get there. */
export interface DocumentType<T> {
  readonly schema: ZodType<T>;
  readonly latestVersion: number;
  readonly migrations: readonly Migration[];
}

/** Why a document could not be migrated; the UI turns the reason into a translated message. */
export type MigrationErrorReason =
  "notAnObject" | "invalidVersion" | "newerVersion" | "missingMigration";

/** A document that cannot be brought to the latest version. */
export class MigrationError extends Error {
  constructor(
    readonly reason: MigrationErrorReason,
    /** The version the document had when the error occurred, if known. */
    readonly version: number | null,
  ) {
    super(
      `${reason}${version === null ? "" : ` (version ${String(version)})`}`,
    );
    this.name = "MigrationError";
  }
}

/**
 * Brings a parsed JSON value to the latest version of `type` and validates it.
 * A missing `schemaVersion` counts as version 0. Documents from a newer app version are
 * refused rather than downgraded, so saving them can never lose data.
 * @throws MigrationError if the version cannot be handled; ZodError if the result is invalid
 */
export function migrateDocument<T>(value: unknown, type: DocumentType<T>): T {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new MigrationError("notAnObject", null);
  }
  let document = value as RawDocument;
  let version = readVersion(document);
  if (version > type.latestVersion)
    throw new MigrationError("newerVersion", version);

  while (version < type.latestVersion) {
    const step = type.migrations.find(
      (migration) => migration.from === version,
    );
    if (!step) throw new MigrationError("missingMigration", version);
    document = step.migrate(document);
    version = readVersion(document);
  }
  return type.schema.parse(document);
}

function readVersion(document: RawDocument): number {
  const version = document["schemaVersion"] ?? 0;
  if (
    typeof version !== "number" ||
    !Number.isInteger(version) ||
    version < 0
  ) {
    throw new MigrationError("invalidVersion", null);
  }
  return version;
}
