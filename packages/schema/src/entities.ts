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

/**
 * Player visibility per element type. Used for the campaign defaults and for per-element
 * overrides; a missing entry means "inherit" (element → campaign default → visible).
 */
export const visibilityRulesSchema = z.partialRecord(
  visibilityElementTypeSchema,
  visibilitySchema,
);

/** A floor/level of a map (SPEC §3.1). Without its own `asset` it shows the map's asset. */
export const levelSchema = z.looseObject({
  id: idSchema,
  name: z.string().min(1),
  asset: assetRefSchema.optional(),
});

/** A map's grid calibration in map pixels (SPEC §2.2). */
export const gridSchema = z.looseObject({
  /** Size of one grid cell in map pixels. */
  cellSizePx: z.number().positive(),
  offsetXPx: z.number(),
  offsetYPx: z.number(),
});

/** Whether a map file is an image or a video (ADR-0010). */
export const mapKindSchema = z.enum(["image", "video"]);

/** D&D size categories (SPEC §5). */
export const tokenSizeSchema = z.enum([
  "tiny",
  "small",
  "medium",
  "large",
  "huge",
  "gargantuan",
]);

/**
 * Where a token's creature lives (T-180a, ADR-0018): the global library
 * (`library/creatures/…`) or the campaign's player characters (`campaigns/<slug>/characters/`).
 * The id is unique in its place.
 */
export const creatureRefSchema = z.looseObject({
  source: z.enum(["library", "campaign"]),
  id: idSchema,
});

/** A token on the map, mirroring a physical mini or standing in for one. */
export const tokenSchema = z.looseObject({
  id: idSchema,
  name: z.string().min(1),
  size: tokenSizeSchema,
  position: gridCellSchema,
  levelId: idSchema,
  image: assetRefSchema.optional(),
  /** The player who may move this token from their companion (SPEC §2.4); absent for DM-only tokens. */
  ownerPlayerId: idSchema.optional(),
  /** Per-element overrides of the campaign's visibility defaults (token itself, name, HP, conditions …). */
  visibility: visibilityRulesSchema.optional(),
  /**
   * The creature this token is an instance of (T-180a, ADR-0018): its look, senses and values
   * come from it; the token keeps only its own (name, position, size if different). Additive
   * and optional: tokens without one stay valid. A missing creature shows a placeholder.
   */
  creature: creatureRefSchema.optional(),
  /** The creature whose shape the token has now (e.g. a druid's beast form; used by T-180). */
  shape: creatureRefSchema.optional(),
});

/**
 * Fog of war of one level, in map pixels (SPEC §4). `revealed` is the union of its polygons and is
 * shown fully; `remembered` covers areas seen before and now hidden again, shown dimmed without
 * current tokens (memory fog). Where both overlap, `revealed` wins; everything else is unrevealed.
 */
export const levelFogSchema = z.looseObject({
  revealed: z.array(polygonSchema),
  remembered: z.array(polygonSchema),
});

/** Fog of war per level id. */
export const fogStateSchema = z.looseObject({
  levels: z.record(idSchema, levelFogSchema),
});

/** A condition on a combatant, e.g. `poisoned`; without `remainingRounds` it lasts until removed. */
export const conditionSchema = z.looseObject({
  type: z.string().min(1),
  remainingRounds: z.number().int().positive().optional(),
});

/** A participant in combat (SPEC §11). `hp` is absent when the DM does not track it (e.g. player characters). */
export const combatantSchema = z.looseObject({
  id: idSchema,
  name: z.string().min(1),
  tokenId: idSchema.optional(),
  /**
   * Per-combatant visibility overrides; they win over the token's and the campaign's. A combatant
   * without a token is hidden from the initiative until `initiative` is set here (DM decision).
   */
  visibility: visibilityRulesSchema.optional(),
  initiative: z.number(),
  hp: z
    .looseObject({
      current: z.number().int(),
      max: z.number().int().positive(),
      temp: z.number().int().nonnegative(),
    })
    .optional(),
  conditions: z.array(conditionSchema),
});

/** Initiative tracker state; `order` lists every combatant id once, in turn order. */
export const initiativeStateSchema = z
  .looseObject({
    round: z.number().int().nonnegative(),
    activeCombatantId: idSchema.nullable(),
    order: z.array(idSchema),
    combatants: z.array(combatantSchema),
  })
  .superRefine((state, context) => {
    const known = new Set(state.combatants.map((combatant) => combatant.id));
    if (known.size !== state.combatants.length) {
      context.addIssue({
        code: "custom",
        path: ["combatants"],
        message: "combatant ids must be unique",
      });
    }
    const inOrder = new Set(state.order);
    if (
      inOrder.size !== state.order.length ||
      inOrder.size !== known.size ||
      state.order.some((id) => !known.has(id))
    ) {
      context.addIssue({
        code: "custom",
        path: ["order"],
        message: "must list every combatant exactly once",
      });
    }
    if (
      state.activeCombatantId !== null &&
      !inOrder.has(state.activeCombatantId)
    ) {
      context.addIssue({
        code: "custom",
        path: ["activeCombatantId"],
        message: "must be in the order",
      });
    }
  });

export type Player = z.infer<typeof playerSchema>;
export type VisibilityElementType = z.infer<typeof visibilityElementTypeSchema>;
export type VisibilityRules = z.infer<typeof visibilityRulesSchema>;
export type Level = z.infer<typeof levelSchema>;
export type Grid = z.infer<typeof gridSchema>;
export type MapKind = z.infer<typeof mapKindSchema>;
export type TokenSize = z.infer<typeof tokenSizeSchema>;
export type CreatureRef = z.infer<typeof creatureRefSchema>;
export type Token = z.infer<typeof tokenSchema>;
export type LevelFog = z.infer<typeof levelFogSchema>;
export type FogState = z.infer<typeof fogStateSchema>;
export type Condition = z.infer<typeof conditionSchema>;
export type Combatant = z.infer<typeof combatantSchema>;
export type InitiativeState = z.infer<typeof initiativeStateSchema>;
