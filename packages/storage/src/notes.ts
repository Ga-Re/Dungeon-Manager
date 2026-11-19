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
    return { status: file.kind };
  } catch {
    return { status: "unreadable" };
  }
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
      .map((entry) => entry.name.slice(0, -".md".length))
      .filter(isValidFileId)
      .sort();
  return { sessions: await ids("sessions"), scenes: await ids("scenes") };
}
