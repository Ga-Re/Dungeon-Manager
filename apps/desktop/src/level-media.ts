// The file a level shows (T-118c): its own image or video, else the map's.
import { mapKind } from "@dungeon-manager/storage";

interface LevelledMap {
  readonly kind: "image" | "video";
  readonly asset?: { readonly path: string } | undefined;
  readonly levels: readonly {
    readonly id: string;
    readonly asset?: { readonly path: string } | undefined;
  }[];
}

/**
 * What to load for `levelId` of `map`: the level's own file (image or video by its file type,
 * as a level may differ from the map), else the map's file and kind. `null` without a file.
 */
export function levelMedia(
  map: LevelledMap,
  levelId: string | undefined,
): { readonly path: string; readonly kind: "image" | "video" } | null {
  const own = map.levels.find(({ id }) => id === levelId)?.asset;
  if (own) return { path: own.path, kind: mapKind(own.path) };
  return map.asset ? { path: map.asset.path, kind: map.kind } : null;
}
