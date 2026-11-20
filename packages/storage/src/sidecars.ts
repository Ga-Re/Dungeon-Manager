import type { Grid, Level, Sidecar } from "@dungeon-manager/schema";
import { findConflictCopies, type ConflictCopy } from "./conflicts.js";
import type { FileSystem } from "./fs.js";
import { SIDECAR_SUFFIX } from "./layout.js";

/**
 * Conflict copies of sidecars in a library folder (ARCHITECTURE §6.3), e.g.
 * `turm.png.dm (conflicted copy …).json` next to `turm.png.dm.json`. Detection only: both
 * versions are kept. @throws when the adapter cannot list the folder
 */
export async function listSidecarConflicts(
  fs: FileSystem,
  directory: string,
): Promise<ConflictCopy[]> {
  const names = ((await fs.list(directory)) ?? [])
    .filter((entry) => entry.kind === "file" && entry.name.endsWith(".json"))
    .map((entry) => entry.name);
  return findConflictCopies(names).filter((conflict) =>
    conflict.original.endsWith(SIDECAR_SUFFIX),
  );
}

/** The grid and levels a version 2 scene embedded, before they moved to the sidecar. */
export interface LegacyMap {
  readonly grid: Grid;
  readonly levels: readonly Level[];
}

/** What becomes of a version 2 scene's embedded map data (ADR-0012 migration). */
export type LegacyAdoption =
  /** The map has no data in its sidecar yet: this sidecar takes the scene's. */
  | { readonly kind: "seed"; readonly sidecar: Sidecar }
  /** The sidecar already holds it: the scene can drop its copy. */
  | { readonly kind: "fits" }
  /** Another scene seeded different data: the scene keeps its copy, the DM decides. */
  | { readonly kind: "differs" };

const sameAsset = (a: Level["asset"], b: Level["asset"]) =>
  a?.path === b?.path && a?.hash === b?.hash;

/**
 * Decides how a version 2 scene's grid and levels move into its map's sidecar. The first scene
 * of a map seeds it. Later scenes fit when the grid is the same and the sidecar still has each of
 * their levels with the same image – level names and added levels are global edits and win.
 * Anything else would move tokens or fog, so it is left to the DM. `hash` is the map file's.
 */
export function adoptLegacyMap(
  sidecar: Sidecar | null,
  legacy: LegacyMap,
  hash: string,
): LegacyAdoption {
  const seeded = {
    grid: legacy.grid,
    levels: [...legacy.levels],
    rooms: [],
  };
  if (!sidecar)
    return {
      kind: "seed",
      sidecar: { schemaVersion: 1, original: { hash }, map: seeded },
    };
  if (!sidecar.map)
    return { kind: "seed", sidecar: { ...sidecar, map: seeded } };
  const { grid, levels } = sidecar.map;
  const sameGrid =
    grid.cellSizePx === legacy.grid.cellSizePx &&
    grid.offsetXPx === legacy.grid.offsetXPx &&
    grid.offsetYPx === legacy.grid.offsetYPx;
  const keepsLevels = legacy.levels.every((wanted) =>
    levels.some(
      (level) => level.id === wanted.id && sameAsset(level.asset, wanted.asset),
    ),
  );
  return sameGrid && keepsLevels ? { kind: "fits" } : { kind: "differs" };
}
