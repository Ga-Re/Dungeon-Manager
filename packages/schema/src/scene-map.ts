import { z } from "zod";
import { assetRefSchema } from "./common.js";
import { gridSchema, levelSchema, mapKindSchema } from "./entities.js";
import type { Migration } from "./migrate.js";
import { mapOverridesSchema } from "./sidecar.js";

/**
 * A version 2 scene's own copy of its map's grid and levels. It stays in the scene only while
 * it differs from the map's sidecar, until the DM adopts or discards it (ADR-0012).
 */
export const legacyMapSchema = z.looseObject({
  grid: gridSchema,
  levels: z.array(levelSchema).min(1),
});

/**
 * A scene's map since version 3 (ADR-0012): the map file and the scene's overrides of its
 * elements. Grid, levels and areas belong to the map's sidecar.
 */
export const sceneMapSchema = z.looseObject({
  kind: mapKindSchema,
  asset: assetRefSchema,
  overrides: mapOverridesSchema,
  legacyMap: legacyMapSchema.optional(),
});

export type LegacyMap = z.infer<typeof legacyMapSchema>;
export type SceneMap = z.infer<typeof sceneMapSchema>;

/**
 * Scene v2 → v3: the embedded map becomes a reference; its grid and levels are kept as
 * `legacyMap` until storage has moved them into the map's sidecar (`adoptLegacyMap`).
 */
export const sceneToVersion3: Migration = {
  from: 2,
  migrate: (scene) => {
    const map = scene["map"];
    if (typeof map !== "object" || map === null || Array.isArray(map))
      return { ...scene, schemaVersion: 3 };
    const { grid, levels, ...rest } = map as Record<string, unknown>;
    return {
      ...scene,
      schemaVersion: 3,
      map: { ...rest, overrides: {}, legacyMap: { grid, levels } },
    };
  },
};
