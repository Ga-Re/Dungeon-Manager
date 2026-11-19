import {
  campaignDocument,
  campaignSchema,
  MigrationError,
  migrateDocument,
  sceneDocument,
  sceneSchema,
  sessionDocument,
  sessionSchema,
  type Campaign,
  type DocumentType,
  type MigrationErrorReason,
  type Scene,
  type Session,
} from "@dungeon-manager/schema";
import { findConflictCopies, type ConflictCopy } from "./conflicts.js";
import type { FileSystem, ReadResult } from "./fs.js";
import {
  campaignDirectory,
  campaignFile,
  isValidFileId,
  isValidSlug,
  sceneFile,
  scenesDirectory,
  sessionFile,
  sessionsDirectory,
} from "./layout.js";

/** Outcome of loading a document; never throws for bad, missing or unreadable files (ARCHITECTURE §6.3). */
export type LoadResult<T> =
  | { readonly status: "ok"; readonly value: T }
  | { readonly status: "missing" }
  /** The adapter failed to read (e.g. no permission, I/O error). */
  | { readonly status: "unreadable" }
  /** On-demand cloud placeholder: content not downloaded yet. */
  | { readonly status: "notAvailable" }
  | {
      readonly status: "invalid";
      readonly reason: "path" | "json" | "schema" | MigrationErrorReason;
    };

async function loadDocument<T>(
  fs: FileSystem,
  path: string,
  type: DocumentType<T>,
): Promise<LoadResult<T>> {
  let file: ReadResult;
  try {
    file = await fs.read(path);
  } catch {
    return { status: "unreadable" };
  }
  if (file.kind === "missing") return { status: "missing" };
  if (file.kind === "notAvailable") return { status: "notAvailable" };
  let json: unknown;
  try {
    json = JSON.parse(file.text);
  } catch {
    return { status: "invalid", reason: "json" };
  }
  try {
    return { status: "ok", value: migrateDocument(json, type) };
  } catch (error) {
    return {
      status: "invalid",
      reason: error instanceof MigrationError ? error.reason : "schema",
    };
  }
}

/** JSON as stored in the library: readable diffs for sync clients, trailing newline. */
const serialize = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;

function requireSlug(slug: string): void {
  if (!isValidSlug(slug)) throw new Error(`Invalid campaign slug: ${slug}`);
}

/** Loads `campaigns/<slug>/campaign.json`. */
export function loadCampaign(
  fs: FileSystem,
  slug: string,
): Promise<LoadResult<Campaign>> {
  if (!isValidSlug(slug))
    return Promise.resolve({ status: "invalid", reason: "path" });
  return loadDocument(fs, campaignFile(slug), campaignDocument);
}

/** Validates and writes `campaign.json` atomically. @throws on an invalid slug or campaign */
export async function saveCampaign(
  fs: FileSystem,
  slug: string,
  campaign: Campaign,
): Promise<void> {
  requireSlug(slug);
  const valid = campaignSchema.parse(campaign);
  await fs.makeDirectory(campaignDirectory(slug));
  await fs.writeAtomic(campaignFile(slug), serialize(valid));
}

/** Loads `campaigns/<slug>/scenes/<id>.json`. */
export function loadScene(
  fs: FileSystem,
  slug: string,
  sceneId: string,
): Promise<LoadResult<Scene>> {
  if (!isValidSlug(slug) || !isValidFileId(sceneId))
    return Promise.resolve({ status: "invalid", reason: "path" });
  return loadDocument(fs, sceneFile(slug, sceneId), sceneDocument);
}

/** Validates and writes a scene file (named after its id) atomically. @throws on invalid input */
export async function saveScene(
  fs: FileSystem,
  slug: string,
  scene: Scene,
): Promise<void> {
  requireSlug(slug);
  const valid = sceneSchema.parse(scene);
  if (!isValidFileId(valid.id))
    throw new Error(`Invalid scene id: ${valid.id}`);
  await fs.makeDirectory(scenesDirectory(slug));
  await fs.writeAtomic(sceneFile(slug, valid.id), serialize(valid));
}

/**
 * Whether a name-based OneDrive match really is a copy: documents are saved under their id, so a
 * real document's file contains its own id, while a copy contains the original's. If the content
 * cannot be checked, it counts as a document – hiding a real one would be worse.
 */
async function isConfirmedCopy(
  conflict: ConflictCopy,
  idInFile: (id: string) => Promise<string | null>,
): Promise<boolean> {
  const id = conflict.copy.slice(0, -".json".length);
  if (conflict.provider !== "OneDrive" || !isValidFileId(id)) return true;
  const stored = await idInFile(id);
  return stored !== null && stored !== id;
}

/** Document ids (`<id>.json`) in a folder, plus conflict copies found next to them. */
async function listDocumentIds(
  fs: FileSystem,
  directory: string,
  idInFile: (id: string) => Promise<string | null>,
): Promise<{ ids: string[]; conflicts: ConflictCopy[] }> {
  const entries = (await fs.list(directory)) ?? [];
  const names = entries
    .filter((entry) => entry.kind === "file")
    .map((entry) => entry.name);
  const candidates = findConflictCopies(names);
  const confirmed = await Promise.all(
    candidates.map((conflict) => isConfirmedCopy(conflict, idInFile)),
  );
  const conflicts = candidates.filter((_, index) => confirmed[index]);
  const copies = new Set(conflicts.map((conflict) => conflict.copy));
  const ids = names
    .filter((name) => name.endsWith(".json") && !copies.has(name))
    .map((name) => name.slice(0, -".json".length))
    .filter(isValidFileId)
    .sort();
  return { ids, conflicts };
}

/**
 * Scene ids of a campaign, plus conflict copies found next to them.
 * @throws on an invalid slug or when the adapter cannot list the folder
 */
export async function listScenes(
  fs: FileSystem,
  slug: string,
): Promise<{ sceneIds: string[]; conflicts: ConflictCopy[] }> {
  requireSlug(slug);
  const { ids, conflicts } = await listDocumentIds(
    fs,
    scenesDirectory(slug),
    async (id) => {
      const loaded = await loadScene(fs, slug, id);
      return loaded.status === "ok" ? loaded.value.id : null;
    },
  );
  return { sceneIds: ids, conflicts };
}

/** Loads `campaigns/<slug>/sessions/<id>.json` (T-160). */
export function loadSession(
  fs: FileSystem,
  slug: string,
  sessionId: string,
): Promise<LoadResult<Session>> {
  if (!isValidSlug(slug) || !isValidFileId(sessionId))
    return Promise.resolve({ status: "invalid", reason: "path" });
  return loadDocument(fs, sessionFile(slug, sessionId), sessionDocument);
}

/** Validates and writes a session file (named after its id) atomically. @throws on invalid input */
export async function saveSession(
  fs: FileSystem,
  slug: string,
  session: Session,
): Promise<void> {
  requireSlug(slug);
  const valid = sessionSchema.parse(session);
  if (!isValidFileId(valid.id))
    throw new Error(`Invalid session id: ${valid.id}`);
  await fs.makeDirectory(sessionsDirectory(slug));
  await fs.writeAtomic(sessionFile(slug, valid.id), serialize(valid));
}

/**
 * Session ids of a campaign, plus conflict copies found next to them.
 * @throws on an invalid slug or when the adapter cannot list the folder
 */
export async function listSessions(
  fs: FileSystem,
  slug: string,
): Promise<{ sessionIds: string[]; conflicts: ConflictCopy[] }> {
  requireSlug(slug);
  const { ids, conflicts } = await listDocumentIds(
    fs,
    sessionsDirectory(slug),
    async (id) => {
      const loaded = await loadSession(fs, slug, id);
      return loaded.status === "ok" ? loaded.value.id : null;
    },
  );
  return { sessionIds: ids, conflicts };
}

/** Slugs of the campaign folders in the library, sorted; folders with other names are skipped. */
export async function listCampaigns(fs: FileSystem): Promise<string[]> {
  const entries = (await fs.list("campaigns")) ?? [];
  return entries
    .filter((entry) => entry.kind === "directory" && isValidSlug(entry.name))
    .map((entry) => entry.name)
    .sort();
}
