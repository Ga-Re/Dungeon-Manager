import type { ItemInfo } from "@dungeon-manager/schema";
import { findConflictCopies } from "./conflicts.js";
import { loadSidecar } from "./documents.js";
import type { FileSystem } from "./fs.js";
import { SIDECAR_SUFFIX } from "./layout.js";

// The global map catalog (T-124, SPEC 8.2, ARCHITECTURE §6.5): every map in `library/maps` and
// its folders, shared by all campaigns. Deleting a scene never touches it.

const MAPS_DIRECTORY = "library/maps";
const PREVIEWS_DIRECTORY = "library/.previews";
/** Map files the desktop imports (`import::MAP_EXTENSIONS` in the backend). */
const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "webp"]);
const VIDEO_EXTENSIONS = new Set(["mp4", "webm"]);
/** Folders deeper than this are not searched: a library is folders of packs, not a tree. */
const MAX_DEPTH = 8;

/** A map in the catalog. */
export interface CatalogMap {
  /** Library-relative path, e.g. `library/maps/Höhlen/see.webm`. */
  readonly path: string;
  readonly kind: "image" | "video";
  /** Sync conflict copies of the map's sidecar (file names next to it), for a hint. */
  readonly sidecarConflicts: readonly string[];
  /** Name and origin/license from its sidecar (T-125), if it has a readable one with info. */
  readonly info?: ItemInfo;
}

const extensionOf = (name: string) =>
  name.slice(name.lastIndexOf(".") + 1).toLowerCase();

/**
 * Every map in the library, sorted by path. Sidecars (`*.dm.json`) and their conflict copies
 * are never maps; a sidecar's copies are named with the map they belong to. Hidden files and
 * folders (`.previews`, `.trash`, a sync client's) are skipped.
 */
export async function listLibraryMaps(fs: FileSystem): Promise<CatalogMap[]> {
  const maps: CatalogMap[] = [];
  const visit = async (directory: string, depth: number) => {
    const entries = (await fs.list(directory)) ?? [];
    const names = entries
      .filter((entry) => entry.kind === "file")
      .map((entry) => entry.name);
    const conflicts = findConflictCopies(names).filter((conflict) =>
      conflict.original.endsWith(SIDECAR_SUFFIX),
    );
    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      const path = `${directory}/${entry.name}`;
      if (entry.kind === "directory") {
        if (depth < MAX_DEPTH) await visit(path, depth + 1);
        continue;
      }
      if (entry.name.endsWith(".json")) continue;
      const extension = extensionOf(entry.name);
      const kind = IMAGE_EXTENSIONS.has(extension)
        ? "image"
        : VIDEO_EXTENSIONS.has(extension)
          ? "video"
          : null;
      if (!kind) continue;
      const sidecar = `${entry.name}${SIDECAR_SUFFIX}`;
      // Only a sidecar that is there is read: most maps of a pack have none.
      const loaded = names.includes(sidecar)
        ? await loadSidecar(fs, path)
        : null;
      const info = loaded?.status === "ok" ? loaded.value.info : undefined;
      maps.push({
        path,
        kind,
        sidecarConflicts: conflicts
          .filter((conflict) => conflict.original === sidecar)
          .map((conflict) => conflict.copy),
        ...(info && { info }),
      });
    }
  };
  await visit(MAPS_DIRECTORY, 0);
  return maps.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

/**
 * The preview of a library file, named after its content hash (`sha256:<hex>`): the same file
 * under another name or in another pack shares one preview. @throws on a malformed hash
 */
export function previewFile(hash: string): string {
  const hex = /^sha256:([0-9a-f]{64})$/.exec(hash)?.[1];
  if (!hex) throw new Error(`Invalid hash: ${hash}`);
  return `${PREVIEWS_DIRECTORY}/${hex}.jpg`;
}
