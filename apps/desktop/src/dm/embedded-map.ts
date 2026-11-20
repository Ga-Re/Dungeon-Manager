import type { ResolvedMap } from "@dungeon-manager/core";
import type { Scene } from "@dungeon-manager/schema";

/**
 * The scene's map as core plays it, taken from the map the scene file still embeds (scene
 * version 2). Once scenes refer to their map's sidecar (T-134c), the DM window resolves it with
 * `resolveMap` instead (T-134d).
 */
export function embeddedMap(scene: Scene): ResolvedMap | null {
  if (!scene.map) return null;
  const { kind, asset, grid, levels } = scene.map;
  return { kind, asset, grid, levels, rooms: [] };
}
