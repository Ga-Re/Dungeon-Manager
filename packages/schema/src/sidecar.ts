import { z } from "zod";
import {
  assetRefSchema,
  fogEffectSchema,
  idSchema,
  polygonSchema,
} from "./common.js";
import { gridSchema, levelSchema } from "./entities.js";
import type { DocumentType } from "./migrate.js";

// Sidecar files `<file>.dm.json` next to a library file (ADR-0012, T-134; format agreed with the
// DM, 2026-11-20): the data that belongs to the map or asset in every campaign. Scenes refer to
// the file and keep only their overrides, keyed by element id. Tags, walls, doors, lights and
// asset data follow in later tasks; loose schemas keep them when an older app saves.

/** Current version of a sidecar file. */
export const SIDECAR_VERSION = 1;

/**
 * A level of a map. An archived level is hidden from new scenes but stays resolvable, because
 * scenes may still refer to it in fog, tokens or the TV state (ADR-0012).
 */
export const sidecarLevelSchema = levelSchema.extend({
  archived: z.boolean().optional(),
});

/** A room or area of a map, e.g. for revealing it at once (T-108c). */
export const roomSchema = z.looseObject({
  id: idSchema,
  name: z.string().min(1),
  area: polygonSchema,
});

/** What a sidecar knows about a map: its grid, its levels and its rooms. */
export const mapDataSchema = z
  .looseObject({
    grid: gridSchema,
    levels: z.array(sidecarLevelSchema).min(1),
    rooms: z.array(roomSchema),
    /** The fog's biome for every scene of this map (T-168); optional and additive. */
    fogEffect: fogEffectSchema.optional(),
  })
  .refine(
    (map) => {
      const ids = [...map.levels, ...map.rooms].map((element) => element.id);
      return new Set(ids).size === ids.length;
    },
    { message: "element ids must be unique", path: ["levels"] },
  );

/** The longest origin or license text: a sentence or a link, not a license's full text. */
export const ITEM_TEXT_MAX = 1000;

/**
 * A catalog item's name and where it comes from (T-125, SPEC 8.2; DM decision 2026-11-22: its
 * own block, the same for maps, tokens and assets). Every field is optional: without a name the
 * catalog shows the file name.
 */
export const itemInfoSchema = z.looseObject({
  name: z.string().min(1).max(200).optional(),
  /** Where the file comes from, e.g. a pack, an artist or "selbst gezeichnet". */
  origin: z.string().max(ITEM_TEXT_MAX).optional(),
  /** The terms it may be used under, e.g. "CC0" or "nur privat". */
  license: z.string().max(ITEM_TEXT_MAX).optional(),
});

/** `<file>.dm.json`. `original` is the hash of the file it describes, to re-link it (§6.3). */
export const sidecarSchema = z.looseObject({
  schemaVersion: z.literal(SIDECAR_VERSION),
  original: z.looseObject({ hash: assetRefSchema.shape.hash }),
  map: mapDataSchema.optional(),
  info: itemInfoSchema.optional(),
});

/**
 * A scene's change to one map element: another name or area, or the element left out of this
 * scene (`hidden`). Grid and levels are never overridden, so minis always fit (ADR-0012).
 */
export const elementOverrideSchema = z.looseObject({
  name: z.string().min(1).optional(),
  area: polygonSchema.optional(),
  hidden: z.boolean().optional(),
});

/** A scene's overrides of its map's elements, keyed by element id. */
export const mapOverridesSchema = z.record(idSchema, elementOverrideSchema);

export type SidecarLevel = z.infer<typeof sidecarLevelSchema>;
export type Room = z.infer<typeof roomSchema>;
export type MapData = z.infer<typeof mapDataSchema>;
export type Sidecar = z.infer<typeof sidecarSchema>;
export type ItemInfo = z.infer<typeof itemInfoSchema>;
export type ElementOverride = z.infer<typeof elementOverrideSchema>;
export type MapOverrides = z.infer<typeof mapOverridesSchema>;

/** Reading a sidecar file: migrations from older versions, then validation. */
export const sidecarDocument: DocumentType<Sidecar> = {
  schema: sidecarSchema,
  latestVersion: SIDECAR_VERSION,
  migrations: [],
};
