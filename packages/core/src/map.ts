import type {
  AssetRef,
  FogEffect,
  Grid,
  Level,
  MapData,
  MapKind,
  MapOverrides,
  Room,
  Scene,
  SidecarLevel,
} from "@dungeon-manager/schema";

// A scene's map is the map file's global data (its sidecar, ADR-0012) plus the scene's
// overrides. Renderer, rules and projection use only the resolved map.

/** A scene's map as it is played: the global data with the scene's overrides applied. */
export interface ResolvedMap {
  readonly kind: MapKind;
  readonly asset: AssetRef;
  readonly grid: Grid;
  /** All levels, archived ones included: scenes may still refer to them. */
  readonly levels: readonly SidecarLevel[];
  /** The rooms of this scene: hidden ones are left out. */
  readonly rooms: readonly Room[];
  /** The fog's biome for every scene of this map (T-168), if the map has one. */
  readonly fogEffect?: FogEffect;
}

/** What a scene's map is made of. */
export interface MapSource {
  readonly kind: MapKind;
  readonly asset: AssetRef;
  /** The sidecar's map data; `null` while the map has no sidecar yet. */
  readonly data: MapData | null;
  readonly overrides: MapOverrides;
  /** The single level of a map without sidecar data (its name is translated by the caller). */
  readonly defaultLevel: Level;
}

/** Until it is calibrated (T-106), a map shows 100 pixels per cell. */
const PLACEHOLDER_GRID: Grid = { cellSizePx: 100, offsetXPx: 0, offsetYPx: 0 };

/**
 * Applies a scene's overrides to its map's global data. Only rooms can be overridden so far
 * (walls, doors and lights follow in stage 5); grid and levels never are, so minis always fit.
 * An override whose element is gone, or that names a level, stays inactive and is reported so
 * the DM can clean it up. The input is not changed.
 * @returns the resolved map and the ids of the orphaned overrides, sorted
 */
export function resolveMap(source: MapSource): {
  readonly map: ResolvedMap;
  readonly orphanedOverrides: readonly string[];
} {
  const data: MapData = source.data ?? {
    grid: PLACEHOLDER_GRID,
    levels: [source.defaultLevel],
    rooms: [],
  };
  const roomIds = new Set(data.rooms.map((room) => room.id));
  const rooms = data.rooms.flatMap((room): Room[] => {
    const override = source.overrides[room.id];
    if (!override) return [room];
    if (override.hidden === true) return [];
    return [
      {
        ...room,
        ...(override.name !== undefined && { name: override.name }),
        ...(override.area !== undefined && { area: override.area }),
      },
    ];
  });
  return {
    map: {
      kind: source.kind,
      asset: source.asset,
      grid: data.grid,
      levels: data.levels,
      rooms,
      ...(data.fogEffect && { fogEffect: data.fogEffect }),
    },
    orphanedOverrides: Object.keys(source.overrides)
      .filter((id) => !roomIds.has(id))
      .sort(),
  };
}

/** The levels a scene refers to: in its fog, its tokens and what the TV shows or showed. */
export function levelsInUse(scene: Scene): ReadonlySet<string> {
  return new Set([
    ...Object.keys(scene.fog.levels),
    ...scene.tokens.map((token) => token.levelId),
    ...(scene.table ? [scene.table.levelId, ...scene.table.shownLevelIds] : []),
  ]);
}

/** Outcome of removing a level from a map's data. */
export type LevelRemoval =
  | { readonly kind: "removed"; readonly data: MapData }
  /** Scenes still refer to it: archived instead, so they stay resolvable (ADR-0012). */
  | {
      readonly kind: "archived";
      readonly data: MapData;
      readonly usedBy: readonly string[];
    }
  /** The map's only level that is not archived: new scenes need one to start on. */
  | { readonly kind: "lastLevel" }
  | { readonly kind: "unknownLevel" };

/**
 * Removes a level from a map's global data, or archives it while any of `scenes` (every scene
 * using this map) still refers to it. A map keeps at least one level that is not archived.
 */
export function removeLevel(
  data: MapData,
  levelId: string,
  scenes: readonly Scene[],
): LevelRemoval {
  const target = data.levels.find((level) => level.id === levelId);
  if (!target) return { kind: "unknownLevel" };
  const active = data.levels.filter((level) => level.archived !== true);
  if (target.archived !== true && active.length === 1)
    return { kind: "lastLevel" };
  const usedBy = scenes
    .filter((scene) => levelsInUse(scene).has(levelId))
    .map((scene) => scene.id);
  if (usedBy.length === 0)
    return {
      kind: "removed",
      data: {
        ...data,
        levels: data.levels.filter((level) => level.id !== levelId),
      },
    };
  return {
    kind: "archived",
    usedBy,
    data: {
      ...data,
      levels: data.levels.map((level) =>
        level.id === levelId ? { ...level, archived: true } : level,
      ),
    },
  };
}

/**
 * Adds a level at the end of a map's levels (T-118d), optionally with its own image or video –
 * which must have the map's pixel size, checked by the caller, as one calibration fits all levels
 * (ADR-0012). @returns the new map data, or `null` for an id the map already uses or an empty name
 */
export function addLevel(data: MapData, level: Level): MapData | null {
  const name = level.name.trim();
  const ids = [...data.levels, ...data.rooms].map((element) => element.id);
  if (name === "" || ids.includes(level.id)) return null;
  return { ...data, levels: [...data.levels, { ...level, name }] };
}

/** Renames a level in every scene of the map. @returns `null` for an unknown level or empty name */
export function renameLevel(
  data: MapData,
  levelId: string,
  name: string,
): MapData | null {
  const trimmed = name.trim();
  if (trimmed === "" || !data.levels.some((level) => level.id === levelId))
    return null;
  return {
    ...data,
    levels: data.levels.map((level) =>
      level.id === levelId ? { ...level, name: trimmed } : level,
    ),
  };
}
