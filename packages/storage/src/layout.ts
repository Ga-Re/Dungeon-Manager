import { idSchema } from "@dungeon-manager/schema";
import type { FileSystem } from "./fs.js";

/** Directories of a library (ARCHITECTURE §6.2). Device settings never live here. */
export const LIBRARY_DIRECTORIES = [
  "library/maps",
  "library/tokens",
  "library/assets",
  "library/sounds",
  "library/effects",
  "library/.previews",
  "campaigns",
] as const;

/** Creates the library layout; safe to call on an existing library. */
export async function ensureLibraryLayout(fs: FileSystem): Promise<void> {
  for (const directory of LIBRARY_DIRECTORIES)
    await fs.makeDirectory(directory);
}

/** Names Windows refuses as file names, with any extension (e.g. `nul.json`). */
const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])$/i;

/** Campaign folder names: lowercase letters, digits and dashes, no Windows device names. */
export function isValidSlug(slug: string): boolean {
  return /^[a-z0-9][a-z0-9-]{0,63}$/.test(slug) && !WINDOWS_RESERVED.test(slug);
}

/**
 * Entity ids usable as file names: `idSchema` minus Windows device names. Ids differing only
 * in case still collide on case-insensitive file systems (T-119).
 */
export function isValidFileId(id: string): boolean {
  return idSchema.safeParse(id).success && !WINDOWS_RESERVED.test(id);
}

export const campaignDirectory = (slug: string) => `campaigns/${slug}`;
export const campaignFile = (slug: string) =>
  `${campaignDirectory(slug)}/campaign.json`;
export const scenesDirectory = (slug: string) =>
  `${campaignDirectory(slug)}/scenes`;
export const sceneFile = (slug: string, sceneId: string) =>
  `${scenesDirectory(slug)}/${sceneId}.json`;
