import { z } from "zod";
import {
  assetRefSchema,
  gridCellSchema,
  idSchema,
  polygonSchema,
  visibilitySchema,
} from "./common.js";

/** A player at the table (names only; no contact data). */
export const playerSchema = z.looseObject({
  id: idSchema,
  name: z.string().min(1),
  characterName: z.string().min(1).optional(),
});

/** Element types whose player visibility can be configured (SPEC §6). */
export const visibilityElementTypeSchema = z.enum([
  "token",
  "name",
  "hp",
  "conditions",
  "asset",
  "trap",
  "door",
  "light",
  "spellArea",
  "initiative",
]);

/** Default visibility for one element type; individual elements may override it. */
export const visibilityRuleSchema = z.looseObject({
  elementType: visibilityElementTypeSchema,
  visibility: visibilitySchema,
});

/** A floor/level of a map; fog and tokens belong to a level (SPEC §3.1). */
export const levelSchema = z.looseObject({
  id: idSchema,
  name: z.string().min(1),
});

/** A battle map: image or video, its grid and its levels. */
export const mapSchema = z.looseObject({
  kind: z.enum(["image", "video"]),
  asset: assetRefSchema,
  grid: z.looseObject({
    /** Size of one grid cell in map pixels. */
    cellSizePx: z.number().positive(),
    offsetXPx: z.number(),
    offsetYPx: z.number(),
  }),
  levels: z.array(levelSchema).min(1),
});

/** D&D size categories (SPEC §5). */
export const tokenSizeSchema = z.enum([
  "tiny",
  "small",
  "medium",
  "large",
  "huge",
  "gargantuan",
]);

/** A token on the map, mirroring a physical mini or standing in for one. */
export const tokenSchema = z.looseObject({
  id: idSchema,
  name: z.string().min(1),
  size: tokenSizeSchema,
  position: gridCellSchema,
  levelId: idSchema,
  image: assetRefSchema.optional(),
  visibility: visibilitySchema,
  combatantId: idSchema.optional(),
});

/** Fog of war per level: revealed areas and remembered (dimmed) areas, in map pixels (SPEC §4). */
export const fogStateSchema = z.looseObject({
  levels: z.record(
    idSchema,
    z.looseObject({
      revealed: z.array(polygonSchema),
      remembered: z.array(polygonSchema),
    }),
  ),
});

/** A condition on a combatant; without `remainingRounds` it lasts until removed. */
export const conditionSchema = z.looseObject({
  id: z.string().min(1),
  remainingRounds: z.number().int().positive().optional(),
});

/** A participant in combat (SPEC §11). */
export const combatantSchema = z.looseObject({
  id: idSchema,
  name: z.string().min(1),
  tokenId: idSchema.optional(),
  initiative: z.number(),
  hp: z.looseObject({
    current: z.number().int(),
    max: z.number().int().positive(),
    temp: z.number().int().nonnegative(),
  }),
  conditions: z.array(conditionSchema),
});

/** Initiative tracker state; `order` lists combatant ids in turn order. */
export const initiativeStateSchema = z.looseObject({
  round: z.number().int().nonnegative(),
  activeCombatantId: idSchema.nullable(),
  order: z.array(idSchema),
  combatants: z.array(combatantSchema),
});

export type Player = z.infer<typeof playerSchema>;
export type VisibilityElementType = z.infer<typeof visibilityElementTypeSchema>;
export type VisibilityRule = z.infer<typeof visibilityRuleSchema>;
export type Level = z.infer<typeof levelSchema>;
export type MapSpec = z.infer<typeof mapSchema>;
export type TokenSize = z.infer<typeof tokenSizeSchema>;
export type Token = z.infer<typeof tokenSchema>;
export type FogState = z.infer<typeof fogStateSchema>;
export type Condition = z.infer<typeof conditionSchema>;
export type Combatant = z.infer<typeof combatantSchema>;
export type InitiativeState = z.infer<typeof initiativeStateSchema>;
