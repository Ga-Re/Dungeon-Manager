import { notePathSchema } from "@dungeon-manager/schema";
import type { FileSystem } from "./fs.js";
import { campaignDirectory, isValidFileId, isValidSlug } from "./layout.js";

/** Whose fixed note a file is (T-161). */
export type NoteOwner =
  | { readonly kind: "campaign" }
  | { readonly kind: "session"; readonly id: string }
  | { readonly kind: "scene"; readonly id: string };

const NOTES = "notes";

function requireSlug(slug: string): void {
  if (!isValidSlug(slug)) throw new Error(`Invalid campaign slug: ${slug}`);
}

/**
 * The fixed note of a campaign, session or scene, relative to the campaign folder (DM decision,
 * 2026-11-19): `notes/campaign.md`, `notes/sessions/<id>.md`, `notes/scenes/<id>.md`.
 * @throws on an unsafe id
 */
export function ownNotePath(owner: NoteOwner): string {
  if (owner.kind === "campaign") return `${NOTES}/campaign.md`;
  if (!isValidFileId(owner.id)) throw new Error(`Invalid id: ${owner.id}`);
  return `${NOTES}/${owner.kind === "session" ? "sessions" : "scenes"}/${owner.id}.md`;
}

/** A note path inside the campaign folder as a library path. @throws on an unsafe path */
function libraryPath(slug: string, notePath: string): string {
  requireSlug(slug);
  if (!notePathSchema.safeParse(notePath).success)
    throw new Error(`Invalid note path: ${notePath}`);
  return `${campaignDirectory(slug)}/${notePath}`;
}

/** The library path of a fixed note. @throws on an unsafe slug or id */
export function noteFile(slug: string, owner: NoteOwner): string {
  return libraryPath(slug, ownNotePath(owner));
}

/** Outcome of reading a note; never throws for bad, missing or unreadable files. */
export type NoteResult =
  | { readonly status: "ok"; readonly text: string }
  | { readonly status: "missing" }
  | { readonly status: "notAvailable" }
  | { readonly status: "unreadable" }
  /** The path is not a note inside the campaign folder. */
  | { readonly status: "invalid" };

/** Reads a note by its path relative to the campaign folder. */
export async function readNote(
  fs: FileSystem,
  slug: string,
  notePath: string,
): Promise<NoteResult> {
  let path: string;
  try {
    path = libraryPath(slug, notePath);
  } catch {
    return { status: "invalid" };
  }
  try {
    const file = await fs.read(path);
    if (file.kind === "ok") return { status: "ok", text: file.text };
    if (file.kind === "missing" && OWN_NOTE.test(notePath))
      return await readOwnNoteIgnoringCase(fs, path);
    return { status: file.kind };
  } catch {
    return { status: "unreadable" };
  }
}

/** A session's or scene's own note, whose name is an id (T-234). */
const OWN_NOTE = /^notes\/(sessions|scenes)\/[^/]+\.md$/;

/**
 * An own note under a version 1 name with capitals (T-234): a case-sensitive file system does
 * not find `Turm.md` under `turm.md`. It is looked up ignoring case, and moved to the lowercase
 * name – written there first (only if still free), then the old file goes to the trash; if that
 * fails, the note still reads from the old name.
 */
async function readOwnNoteIgnoringCase(
  fs: FileSystem,
  path: string,
): Promise<NoteResult> {
  const slash = path.lastIndexOf("/");
  const name = path.slice(slash + 1);
  const entries = (await fs.list(path.slice(0, slash))) ?? [];
  const legacy = entries.find(
    (entry) =>
      entry.kind === "file" &&
      entry.name !== name &&
      entry.name.toLowerCase() === name,
  );
  if (!legacy) return { status: "missing" };
  const legacyPath = `${path.slice(0, slash)}/${legacy.name}`;
  const file = await fs.read(legacyPath);
  if (file.kind !== "ok") return { status: file.kind };
  try {
    if ((await fs.read(path)).kind === "missing") {
      await fs.writeAtomic(path, file.text);
      await fs.moveToTrash(legacyPath);
    }
  } catch {
    // Not moved: it still reads from the old name.
  }
  return { status: "ok", text: file.text };
}

/**
 * Starts a note that does not exist yet with its title as a heading; an existing note (maybe
 * written in Obsidian on another device) is never overwritten. A note not downloaded yet
 * counts as existing. Known gap: a note a sync client delivers between the check and the write
 * would be replaced – the file adapter has no create-exclusive write yet.
 * @returns whether the note was created. @throws on an unsafe path or a failed write
 */
export async function createNote(
  fs: FileSystem,
  slug: string,
  notePath: string,
  title: string,
): Promise<boolean> {
  const path = libraryPath(slug, notePath);
  const existing = await fs.read(path);
  if (existing.kind !== "missing") return false;
  const folder = path.slice(0, path.lastIndexOf("/"));
  await fs.makeDirectory(folder);
  // One line, never an empty heading.
  const heading = title.replace(/\s+/g, " ").trim() || notePath;
  await fs.writeAtomic(path, `# ${heading}\n`);
  return true;
}

/** The document with `notePath` added to its note links (once). @throws on an unsafe path */
export function linkNote<
  T extends { readonly notes?: readonly string[] | undefined },
>(document: T, notePath: string): T {
  const path = notePath.normalize("NFC");
  if (!notePathSchema.safeParse(path).success)
    throw new Error(`Invalid note path: ${notePath}`);
  const notes = document.notes ?? [];
  if (notes.some((each) => each.normalize("NFC") === path)) return document;
  return { ...document, notes: [...notes, path] };
}

/**
 * The document without the link; an emptied list is left out of the file, so `notes` must be
 * optional in `T` (it is on campaign, session and scene).
 */
export function unlinkNote<
  T extends { readonly notes?: readonly string[] | undefined },
>(document: T, notePath: string): T {
  const path = notePath.normalize("NFC");
  const notes = (document.notes ?? []).filter(
    (each) => each.normalize("NFC") !== path,
  );
  const next: { notes?: readonly string[] } = { ...document, notes };
  if (notes.length === 0) delete next.notes;
  return next as T;
}

/** Ids of the sessions and scenes that have a fixed note file (the campaign note: `readNote`). */
export async function listNoteOwners(
  fs: FileSystem,
  slug: string,
): Promise<{ sessions: string[]; scenes: string[] }> {
  requireSlug(slug);
  const ids = async (folder: string) =>
    ((await fs.list(`${campaignDirectory(slug)}/${NOTES}/${folder}`)) ?? [])
      .filter((entry) => entry.kind === "file" && entry.name.endsWith(".md"))
      // Version 1 names may hold capitals (T-234): listed under the lowercase id.
      .map((entry) => entry.name.slice(0, -".md".length).toLowerCase())
      .filter(isValidFileId)
      .filter((id, index, all) => all.indexOf(id) === index)
      .sort();
  return { sessions: await ids("sessions"), scenes: await ids("scenes") };
}
