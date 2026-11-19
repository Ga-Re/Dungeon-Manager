import type { Scene, Session } from "@dungeon-manager/schema";
import {
  listNoteOwners,
  listScenes,
  readNote,
  listSessions,
  loadScene,
  loadSession,
  type LoadResult,
} from "@dungeon-manager/storage";
import type { LibraryService } from "../platform/library.js";

/** Why a document of the campaign could not be shown. */
export type Problem = "notAvailable" | "invalid";

const problemOf = (result: LoadResult<unknown>): Problem =>
  result.status === "notAvailable" ? "notAvailable" : "invalid";

export interface SceneEntry {
  readonly id: string;
  /** The scene, or `null` with the reason when it could not be read. */
  readonly scene: Scene | null;
  readonly problem: Problem | null;
}

export interface SessionEntry {
  readonly id: string;
  readonly session: Session | null;
  readonly problem: Problem | null;
}

/** All scenes of a campaign, sorted by name. @throws when the folder cannot be listed */
export async function readScenes(
  service: LibraryService,
  slug: string,
): Promise<SceneEntry[]> {
  const { sceneIds } = await listScenes(service.fs, slug);
  const entries = await Promise.all(
    sceneIds.map(async (id): Promise<SceneEntry> => {
      const result = await loadScene(service.fs, slug, id);
      return result.status === "ok"
        ? { id, scene: result.value, problem: null }
        : { id, scene: null, problem: problemOf(result) };
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
  const { sessionIds } = await listSessions(service.fs, slug);
  const entries = await Promise.all(
    sessionIds.map(async (id): Promise<SessionEntry> => {
      const result = await loadSession(service.fs, slug, id);
      return result.status === "ok"
        ? { id, session: result.value, problem: null }
        : { id, session: null, problem: problemOf(result) };
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
