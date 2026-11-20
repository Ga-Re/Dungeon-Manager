import { assetRefSchema, idSchema } from "@dungeon-manager/schema";
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
 * Entity ids usable as file names: `idSchema` minus Windows device names. Ids are lowercase
 * (T-119), so two ids never name the same file on a case-insensitive file system.
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
export const sessionsDirectory = (slug: string) =>
  `${campaignDirectory(slug)}/sessions`;
export const sessionFile = (slug: string, sessionId: string) =>
  `${sessionsDirectory(slug)}/${sessionId}.json`;

/** Sidecars are named after the file they describe (ADR-0012). */
export const SIDECAR_SUFFIX = ".dm.json";

/**
 * The sidecar `<file>.dm.json` of a library file (ADR-0012). Only files in `library/` have one,
 * like the watcher's assets (`classifyLibraryPath`); hidden folders such as `.previews` hold
 * generated files and have none.
 * @throws on a path outside the library, an unsafe or hidden path, or a sidecar itself
 */
export function sidecarFile(assetPath: string): string {
  const parts = assetPath.split("/");
  if (
    parts[0] !== "library" ||
    parts.length < 2 ||
    parts.some((part) => part.startsWith(".")) ||
    !assetRefSchema.shape.path.safeParse(assetPath).success ||
    assetPath.endsWith(SIDECAR_SUFFIX)
  )
    throw new Error(`Not a library file: ${assetPath}`);
  return `${assetPath}${SIDECAR_SUFFIX}`;
}
