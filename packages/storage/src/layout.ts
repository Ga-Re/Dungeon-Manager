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

/** Campaign folder names: lowercase letters, digits and dashes, safe on every OS. */
export function isValidSlug(slug: string): boolean {
  return /^[a-z0-9][a-z0-9-]{0,63}$/.test(slug);
}

/** Entity ids that are also valid file names (same rule as `idSchema`). */
export function isValidFileId(id: string): boolean {
  return /^[A-Za-z0-9_-]{1,64}$/.test(id);
}

export const campaignDirectory = (slug: string) => `campaigns/${slug}`;
export const campaignFile = (slug: string) =>
  `${campaignDirectory(slug)}/campaign.json`;
export const scenesDirectory = (slug: string) =>
  `${campaignDirectory(slug)}/scenes`;
export const sceneFile = (slug: string, sceneId: string) =>
  `${scenesDirectory(slug)}/${sceneId}.json`;
