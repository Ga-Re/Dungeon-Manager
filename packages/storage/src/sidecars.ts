import {
  SIDECAR_VERSION,
  type Grid,
  type LegacyMap,
  type Level,
  type Scene,
  type Sidecar,
} from "@dungeon-manager/schema";
import { findConflictCopies, type ConflictCopy } from "./conflicts.js";
import { loadSidecar, saveSidecar } from "./documents.js";
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

// Compares the grid fields known today; a field added to the loose grid schema must be added here.
const sameGrid = (a: Grid, b: Grid) =>
  a.cellSizePx === b.cellSizePx &&
  a.offsetXPx === b.offsetXPx &&
  a.offsetYPx === b.offsetYPx;

/**
 * Decides how a version 2 scene's grid and levels move into its map's sidecar (ADR-0012). The
 * first scene of a map seeds it. A later scene fits only when the sidecar holds exactly its grid
 * and levels – same ids, names, images and order, none archived. Any difference keeps the
 * scene's copy for the DM to adopt or discard, because each version 2 scene had its own copy
 * and nothing may be lost silently. `sidecar` is `null` only for a missing sidecar: a
 * placeholder or broken one must never be seeded over. `hash` is the map file's.
 */
export function adoptLegacyMap(
  sidecar: Sidecar | null,
  legacy: LegacyMap,
  hash: string,
): LegacyAdoption {
  const seeded = {
    grid: legacy.grid,
    levels: [...legacy.levels],
    areas: [],
  };
  if (!sidecar)
    return {
      kind: "seed",
      sidecar: {
        schemaVersion: SIDECAR_VERSION,
        original: { hash },
        map: seeded,
      },
    };
  if (!sidecar.map)
    return { kind: "seed", sidecar: { ...sidecar, map: seeded } };
  const { grid, levels } = sidecar.map;
  const sameLevels =
    levels.length === legacy.levels.length &&
    legacy.levels.every((wanted, index) => {
      const level = levels[index];
      return (
        level !== undefined &&
        level.id === wanted.id &&
        level.name === wanted.name &&
        level.archived !== true &&
        sameAsset(level.asset, wanted.asset)
      );
    });
  return sameGrid(grid, legacy.grid) && sameLevels
    ? { kind: "fits" }
    : { kind: "differs" };
}

/** The scene without its version 2 copy of grid and levels, once the sidecar holds them. */
export function withoutLegacyMap(scene: Scene): Scene {
  if (!scene.map?.legacyMap) return scene;
  const reference = { ...scene.map };
  delete reference.legacyMap;
  return { ...scene, map: reference };
}

/**
 * Moves a scene's `legacyMap` (its version 2 copy of grid and levels) into its map's sidecar
 * where `adoptLegacyMap` allows it (ADR-0012).
 * @returns `settled` when the sidecar holds the data now (the caller drops the copy with
 *   `withoutLegacyMap` and saves the scene), `differs` when the DM has to decide, `unavailable`
 *   when the sidecar is not downloaded yet or broken (left alone, to try again later); `none`
 *   without a copy. @throws when writing the sidecar fails
 */
export async function settleLegacyMap(
  fs: FileSystem,
  scene: Scene,
): Promise<"settled" | "differs" | "unavailable" | "none"> {
  const map = scene.map;
  if (!map?.legacyMap) return "none";
  const loaded = await loadSidecar(fs, map.asset.path);
  if (loaded.status !== "ok" && loaded.status !== "missing")
    return "unavailable";
  const adoption = adoptLegacyMap(
    loaded.status === "ok" ? loaded.value : null,
    map.legacyMap,
    map.asset.hash,
  );
  if (adoption.kind === "differs") return "differs";
  if (adoption.kind === "seed")
    await saveSidecar(fs, map.asset.path, adoption.sidecar);
  return "settled";
}
