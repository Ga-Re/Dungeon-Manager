import type {
  AssetRef,
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
  const data = source.data ?? {
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
  | { readonly kind: "lastLevel" }
  | { readonly kind: "unknownLevel" };

/**
 * Removes a level from a map's global data, or archives it while any of `scenes` (every scene
 * using this map) still refers to it. A map keeps at least one level.
 */
export function removeLevel(
  data: MapData,
  levelId: string,
  scenes: readonly Scene[],
): LevelRemoval {
  if (!data.levels.some((level) => level.id === levelId))
    return { kind: "unknownLevel" };
  if (data.levels.length === 1) return { kind: "lastLevel" };
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
