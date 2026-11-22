import {
  campaignDocument,
  campaignSchema,
  creatureDocument,
  creatureSchema,
  type Creature,
  sidecarDocument,
  sidecarSchema,
  type Sidecar,
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
  CREATURES_DIRECTORY,
  campaignDirectory,
  campaignFile,
  characterFile,
  charactersDirectory,
  creatureFile,
  isValidCreatureFolder,
  isValidFileId,
  isValidSlug,
  sceneFile,
  scenesDirectory,
  sessionFile,
  sessionsDirectory,
  sidecarFile,
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
      /** With `idCollision`: the two ids that differ only in case, so the DM can fix one. */
      readonly ids?: readonly [string, string];
    };

/**
 * Version 1 allowed capitals in ids and so in file names (T-119). A case-insensitive file system
 * (macOS, Windows) finds `Turm.json` under `turm.json` anyway; a case-sensitive one (Linux) does
 * not, so a missing file is looked up again among the names in its folder, ignoring case.
 * @returns the file and, if found under another name, that name's path
 */
async function readIgnoringCase(
  fs: FileSystem,
  path: string,
): Promise<{ file: ReadResult; legacyPath: string | null }> {
  const file = await fs.read(path);
  if (file.kind !== "missing") return { file, legacyPath: null };
  const slash = path.lastIndexOf("/");
  const name = path.slice(slash + 1);
  const entries = (await fs.list(path.slice(0, slash))) ?? [];
  const legacy = entries.find(
    (entry) =>
      entry.kind === "file" &&
      entry.name !== name &&
      entry.name.toLowerCase() === name,
  );
  if (!legacy) return { file, legacyPath: null };
  const legacyPath = `${path.slice(0, slash)}/${legacy.name}`;
  return { file: await fs.read(legacyPath), legacyPath };
}

/**
 * Moves a document found under a version 1 name to its lowercase name: written there first (only
 * if that name is still free), the old file then goes to the trash. If writing fails, the
 * document keeps loading from the old name. If only the trash step fails, both files stay and the
 * lowercase one is loaded from then on – the old one is a stale duplicate, never lost data.
 * Neither failure stops the DM from working, so neither is reported.
 */
async function moveToLowercaseName(
  fs: FileSystem,
  path: string,
  legacyPath: string,
  value: unknown,
): Promise<void> {
  try {
    // A save or a sync between reading the old file and now may have created the new one.
    if ((await fs.read(path)).kind !== "missing") return;
    await fs.writeAtomic(path, serialize(value));
    await fs.moveToTrash(legacyPath);
  } catch {
    // See above.
  }
}

interface LoadOptions {
  /**
   * The id the file is named after: a document found under a version 1 name is moved to the
   * lowercase name only if its content carries that id, so a conflict copy (which holds the
   * original's id) is never renamed. Without it loading never writes – used when listing checks
   * what a file contains.
   */
  readonly ownId?: string;
  /**
   * Files whose names never held ids (sidecars) are not looked up ignoring case: a missing one
   * is common and must not list its folder each time.
   */
  readonly exactName?: boolean;
}

/** Loads and migrates a document. */
async function loadDocument<T extends object>(
  fs: FileSystem,
  path: string,
  type: DocumentType<T>,
  { ownId, exactName = false }: LoadOptions = {},
): Promise<LoadResult<T>> {
  let file: ReadResult;
  let legacyPath: string | null;
  try {
    ({ file, legacyPath } = exactName
      ? { file: await fs.read(path), legacyPath: null }
      : await readIgnoringCase(fs, path));
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
  let value: T;
  try {
    value = migrateDocument(json, type);
  } catch (error) {
    if (!(error instanceof MigrationError))
      return { status: "invalid", reason: "schema" };
    return {
      status: "invalid",
      reason: error.reason,
      ...(error.ids && { ids: error.ids }),
    };
  }
  if (
    legacyPath !== null &&
    ownId !== undefined &&
    "id" in value &&
    value.id === ownId
  )
    await moveToLowercaseName(fs, path, legacyPath, value);
  return { status: "ok", value };
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
  return loadDocument(fs, sceneFile(slug, sceneId), sceneDocument, {
    ownId: sceneId,
  });
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
  // Ids are lowercase since T-119; a version 1 name is found under its lowercase id.
  const id = conflict.copy.slice(0, -".json".length).toLowerCase();
  if (conflict.provider !== "OneDrive" || !isValidFileId(id)) return true;
  const stored = await idInFile(id);
  return stored !== null && stored !== id;
}

/**
 * Document ids (`<id>.json`) in a folder, plus conflict copies found next to them. Version 1 names
 * with capitals are listed under their lowercase id, once (T-119).
 */
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
  const conflicts = [
    ...candidates.filter((_, index) => confirmed[index]),
    ...caseDuplicates(names),
  ];
  const copies = new Set(conflicts.map((conflict) => conflict.copy));
  const ids = names
    .filter((name) => name.endsWith(".json") && !copies.has(name))
    .map((name) => name.slice(0, -".json".length).toLowerCase())
    .filter(isValidFileId);
  return { ids: [...new Set(ids)].sort(), conflicts };
}

/**
 * Version 1 names with capitals next to the lowercase file they now belong to (T-234): only a
 * case-sensitive file system (Linux) holds both. The lowercase one is current; the other is
 * reported like a conflict copy instead of being hidden, so the DM can merge or delete it.
 */
function caseDuplicates(names: readonly string[]): ConflictCopy[] {
  const present = new Set(names);
  return names
    .filter(
      (name) =>
        name.endsWith(".json") &&
        name !== name.toLowerCase() &&
        present.has(name.toLowerCase()),
    )
    .map((name) => ({
      copy: name,
      original: name.toLowerCase(),
      provider: "capitals" as const,
    }));
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
    // Read only: checking a possible conflict copy must never rename it.
    async (id) => {
      const loaded = await loadDocument(fs, sceneFile(slug, id), sceneDocument);
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
  return loadDocument(fs, sessionFile(slug, sessionId), sessionDocument, {
    ownId: sessionId,
  });
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
    // Read only: checking a possible conflict copy must never rename it.
    async (id) => {
      const loaded = await loadDocument(
        fs,
        sessionFile(slug, id),
        sessionDocument,
      );
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

/**
 * Loads the sidecar of a library file (ADR-0012). `missing` means the file has none yet: the
 * caller uses defaults, and the first edit creates it.
 */
export function loadSidecar(
  fs: FileSystem,
  assetPath: string,
): Promise<LoadResult<Sidecar>> {
  let path: string;
  try {
    path = sidecarFile(assetPath);
  } catch {
    return Promise.resolve({ status: "invalid", reason: "path" });
  }
  return loadDocument(fs, path, sidecarDocument, { exactName: true });
}

/** Validates and writes the sidecar of a library file atomically. @throws on invalid input */
export async function saveSidecar(
  fs: FileSystem,
  assetPath: string,
  sidecar: Sidecar,
): Promise<void> {
  const path = sidecarFile(assetPath);
  await fs.writeAtomic(path, serialize(sidecarSchema.parse(sidecar)));
}

/** A creature file found by `listCreatures`: its id and folder (`""`: the top). */
export interface CreatureEntry {
  readonly id: string;
  readonly folder: string;
}

/** Loads `library/creatures/<folder>/<id>.json` (T-180a); a file naming another id is invalid. */
export async function loadCreature(
  fs: FileSystem,
  folder: string,
  creatureId: string,
): Promise<LoadResult<Creature>> {
  if (!isValidCreatureFolder(folder) || !isValidFileId(creatureId))
    return { status: "invalid", reason: "path" };
  return ownIdChecked(
    await loadDocument(fs, creatureFile(folder, creatureId), creatureDocument),
    creatureId,
  );
}

/** Validates and writes a creature into `folder` (named after its id), atomically. @throws */
export async function saveCreature(
  fs: FileSystem,
  folder: string,
  creature: Creature,
): Promise<void> {
  if (!isValidCreatureFolder(folder))
    throw new Error(`Invalid creature folder: ${folder}`);
  const valid = creatureSchema.parse(creature);
  if (!isValidFileId(valid.id))
    throw new Error(`Invalid creature id: ${valid.id}`);
  await fs.makeDirectory(
    folder === "" ? CREATURES_DIRECTORY : `${CREATURES_DIRECTORY}/${folder}`,
  );
  await fs.writeAtomic(creatureFile(folder, valid.id), serialize(valid));
}

/**
 * All library creatures, walking the folders under `library/creatures`. Hidden folders are left
 * out; folders whose names do not work on every OS (`CR 1:4`, a trailing dot or space, a Windows
 * device name) are skipped and reported, so one odd folder never hides the whole library. Ids
 * are unique in the library: an id found again in a later folder (by path order) is reported in
 * `duplicates`, not used. Conflict copies are reported with their folder.
 */
export async function listCreatures(fs: FileSystem): Promise<{
  creatures: CreatureEntry[];
  duplicates: CreatureEntry[];
  conflicts: (ConflictCopy & { readonly folder: string })[];
  /** Folders (paths inside `library/creatures`) skipped for their names. */
  skippedFolders: string[];
}> {
  const creatures: CreatureEntry[] = [];
  const duplicates: CreatureEntry[] = [];
  const conflicts: (ConflictCopy & { readonly folder: string })[] = [];
  const skippedFolders: string[] = [];
  const seen = new Set<string>();
  const walk = async (folder: string): Promise<void> => {
    const directory =
      folder === "" ? CREATURES_DIRECTORY : `${CREATURES_DIRECTORY}/${folder}`;
    const listed = await listDocumentIds(fs, directory, async (id) => {
      const loaded = await loadDocument(
        fs,
        creatureFile(folder, id),
        creatureDocument,
      );
      return loaded.status === "ok" ? loaded.value.id : null;
    });
    conflicts.push(
      ...listed.conflicts.map((conflict) => ({ ...conflict, folder })),
    );
    for (const id of listed.ids) {
      const entry = { id, folder };
      if (seen.has(id)) duplicates.push(entry);
      else {
        seen.add(id);
        creatures.push(entry);
      }
    }
    const subfolders = ((await fs.list(directory)) ?? [])
      .filter(
        (entry) => entry.kind === "directory" && !entry.name.startsWith("."),
      )
      .map((entry) => (folder === "" ? entry.name : `${folder}/${entry.name}`))
      .sort();
    for (const sub of subfolders) {
      if (isValidCreatureFolder(sub)) await walk(sub);
      else skippedFolders.push(sub);
    }
  };
  await walk("");
  return { creatures, duplicates, conflicts, skippedFolders };
}

/** Loads `campaigns/<slug>/characters/<id>.json`, a player character (T-180a). */
export async function loadCharacter(
  fs: FileSystem,
  slug: string,
  characterId: string,
): Promise<LoadResult<Creature>> {
  if (!isValidSlug(slug) || !isValidFileId(characterId))
    return { status: "invalid", reason: "path" };
  return ownIdChecked(
    await loadDocument(fs, characterFile(slug, characterId), creatureDocument),
    characterId,
  );
}

/** Validates and writes a player character of the campaign, atomically. @throws */
export async function saveCharacter(
  fs: FileSystem,
  slug: string,
  character: Creature,
): Promise<void> {
  requireSlug(slug);
  const valid = creatureSchema.parse(character);
  if (!isValidFileId(valid.id))
    throw new Error(`Invalid character id: ${valid.id}`);
  await fs.makeDirectory(charactersDirectory(slug));
  await fs.writeAtomic(characterFile(slug, valid.id), serialize(valid));
}

/** The campaign's player character ids, plus conflict copies. @throws on an invalid slug */
export async function listCharacters(
  fs: FileSystem,
  slug: string,
): Promise<{ characterIds: string[]; conflicts: ConflictCopy[] }> {
  requireSlug(slug);
  const { ids, conflicts } = await listDocumentIds(
    fs,
    charactersDirectory(slug),
    async (id) => {
      const loaded = await loadDocument(
        fs,
        characterFile(slug, id),
        creatureDocument,
      );
      return loaded.status === "ok" ? loaded.value.id : null;
    },
  );
  return { characterIds: ids, conflicts };
}

/** A creature file names its creature: one naming another is not that creature. */
function ownIdChecked(
  loaded: LoadResult<Creature>,
  id: string,
): LoadResult<Creature> {
  return loaded.status === "ok" && loaded.value.id !== id
    ? { status: "invalid", reason: "schema" }
    : loaded;
}
