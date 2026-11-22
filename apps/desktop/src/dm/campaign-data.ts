import type { Scene, Session } from "@dungeon-manager/schema";
import {
  listNoteOwners,
  listScenes,
  readNote,
  listSessions,
  loadScene,
  loadSession,
  type ConflictCopy,
  type LoadResult,
} from "@dungeon-manager/storage";
import type { LibraryService } from "../platform/library.js";

/**
 * Why a document of the campaign could not be shown; `idCollision` (T-234): two of its ids
 * differ only in case, named in `collision` so the DM can rename one in the file.
 */
export type Problem = "notAvailable" | "invalid" | "idCollision";

const problemOf = (result: LoadResult<unknown>): Problem => {
  if (result.status === "notAvailable") return "notAvailable";
  if (result.status === "invalid" && result.reason === "idCollision")
    return "idCollision";
  return "invalid";
};

/** The two ids of an `idCollision`, if that is the problem. */
const collisionOf = (result: LoadResult<unknown>) =>
  result.status === "invalid" && result.ids ? { collision: result.ids } : {};

/**
 * Version 1 files whose names differ only in case from the document's own file (T-234): only
 * a case-sensitive file system holds both; the DM merges or deletes the old one.
 */
function duplicatesOf(
  conflicts: readonly ConflictCopy[],
  id: string,
): { readonly duplicates?: readonly string[] } {
  const files = conflicts
    .filter(
      (conflict) =>
        conflict.provider === "capitals" && conflict.original === `${id}.json`,
    )
    .map((conflict) => conflict.copy);
  return files.length > 0 ? { duplicates: files } : {};
}

export interface SceneEntry {
  readonly id: string;
  /** The scene, or `null` with the reason when it could not be read. */
  readonly scene: Scene | null;
  readonly problem: Problem | null;
  readonly collision?: readonly [string, string];
  /** Old files next to its own that differ only in case (T-234). */
  readonly duplicates?: readonly string[];
}

export interface SessionEntry {
  readonly id: string;
  readonly session: Session | null;
  readonly problem: Problem | null;
  readonly collision?: readonly [string, string];
  readonly duplicates?: readonly string[];
}

/** All scenes of a campaign, sorted by name. @throws when the folder cannot be listed */
export async function readScenes(
  service: LibraryService,
  slug: string,
): Promise<SceneEntry[]> {
  const { sceneIds, conflicts } = await listScenes(service.fs, slug);
  const entries = await Promise.all(
    sceneIds.map(async (id): Promise<SceneEntry> => {
      const result = await loadScene(service.fs, slug, id);
      const duplicates = duplicatesOf(conflicts, id);
      return result.status === "ok"
        ? { id, scene: result.value, problem: null, ...duplicates }
        : {
            id,
            scene: null,
            problem: problemOf(result),
            ...collisionOf(result),
            ...duplicates,
          };
    }),
  );
  return entries.sort((a, b) =>
    (a.scene?.name ?? a.id).localeCompare(b.scene?.name ?? b.id),
  );
}

/**
 * All sessions of a campaign, by date (undated last), then name (T-160b).
 * @throws when the folder cannot be listed
 */
export async function readSessions(
  service: LibraryService,
  slug: string,
): Promise<SessionEntry[]> {
  const { sessionIds, conflicts } = await listSessions(service.fs, slug);
  const entries = await Promise.all(
    sessionIds.map(async (id): Promise<SessionEntry> => {
      const result = await loadSession(service.fs, slug, id);
      const duplicates = duplicatesOf(conflicts, id);
      return result.status === "ok"
        ? { id, session: result.value, problem: null, ...duplicates }
        : {
            id,
            session: null,
            problem: problemOf(result),
            ...collisionOf(result),
            ...duplicates,
          };
    }),
  );
  const key = (entry: SessionEntry) =>
    `${entry.session?.date ?? "9999-99-99"} ${entry.session?.name ?? entry.id}`;
  return entries.sort((a, b) => key(a).localeCompare(key(b)));
}

/** A calendar day `YYYY-MM-DD` in the DM's language, independent of the time zone. */
export function formatDate(date: string, language: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString(language, {
    timeZone: "UTC",
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/** Which fixed notes exist (T-161b): the campaign's, and the sessions' and scenes' by id. */
export interface NotesIndex {
  readonly campaign: boolean;
  readonly sessions: readonly string[];
  readonly scenes: readonly string[];
}

/** @throws when the notes folders cannot be listed */
export async function readNotesIndex(
  service: LibraryService,
  slug: string,
): Promise<NotesIndex> {
  const [owners, campaign] = await Promise.all([
    listNoteOwners(service.fs, slug),
    readNote(service.fs, slug, "notes/campaign.md"),
  ]);
  return {
    campaign: campaign.status === "ok" || campaign.status === "notAvailable",
    ...owners,
  };
}

/** How far `listCampaignFiles` looks, so a huge vault cannot stall the window. */
const FILE_SEARCH = { depth: 8, entries: 5000 } as const;

/**
 * Every file in the campaign folder (relative to it), for finding Obsidian targets by name
 * (T-163). Hidden and tool folders (`.obsidian`, `.trash`, …) are skipped; the search stops at
 * `FILE_SEARCH` limits.
 */
export async function listCampaignFiles(
  service: LibraryService,
  slug: string,
): Promise<string[]> {
  const root = `campaigns/${slug}`;
  const files: string[] = [];
  let queue: { folder: string; depth: number }[] = [{ folder: "", depth: 0 }];
  let seen = 0;
  while (queue.length > 0 && seen < FILE_SEARCH.entries) {
    const next: typeof queue = [];
    for (const { folder, depth } of queue) {
      const entries =
        (await service.fs.list(folder ? `${root}/${folder}` : root)) ?? [];
      for (const entry of entries) {
        if (++seen > FILE_SEARCH.entries) break;
        if (entry.name.startsWith(".")) continue;
        const path = folder ? `${folder}/${entry.name}` : entry.name;
        if (entry.kind === "file") files.push(path);
        else if (depth < FILE_SEARCH.depth)
          next.push({ folder: path, depth: depth + 1 });
      }
    }
    queue = next;
  }
  return files;
}
