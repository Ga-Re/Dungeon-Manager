import { z } from "zod";
import {
  assetRefSchema,
  gridCellSchema,
  idSchema,
  polygonSchema,
} from "./common.js";
import { tokenSizeSchema } from "./entities.js";

// What a viewer (player window, companion) receives: the output of `projectForViewer` in core.
// These schemas are STRICT – an unknown key is an error – so a field forgotten in the
// projection's allow-list can never carry hidden data to players (ARCHITECTURE §5.1).

/** HP shown as a coarse state instead of numbers (SPEC §6, "approximate"). */
export const approximateHpSchema = z.enum([
  "unhurt",
  "wounded",
  "badlyWounded",
  "down",
]);

export const viewerTokenSchema = z.strictObject({
  id: idSchema,
  /** Absent when the name is not visible to this viewer. */
  name: z.string().min(1).optional(),
  size: tokenSizeSchema,
  position: gridCellSchema.strict(),
  levelId: idSchema,
  image: assetRefSchema.strict().optional(),
});

export const viewerCombatantSchema = z.strictObject({
  id: idSchema,
  name: z.string().min(1).optional(),
  tokenId: idSchema.optional(),
  /** Exact HP, only when visible to this viewer. */
  hp: z
    .strictObject({
      current: z.number().int(),
      max: z.number().int(),
      temp: z.number().int(),
    })
    .optional(),
  /** Coarse HP state, when HP are "approximate" for this viewer. */
  hpState: approximateHpSchema.optional(),
  conditions: z
    .array(
      z.strictObject({
        type: z.string().min(1),
        remainingRounds: z.number().int().optional(),
      }),
    )
    .optional(),
});

export const viewerInitiativeSchema = z.strictObject({
  round: z.number().int(),
  activeCombatantId: idSchema.nullable(),
  /** Only the combatants this viewer may see, in turn order. */
  combatants: z.array(viewerCombatantSchema),
});

export const viewerSceneSchema = z.strictObject({
  id: idSchema,
  name: z.string().min(1),
  map: z
    .strictObject({
      kind: z.enum(["image", "video"]),
      asset: assetRefSchema.strict(),
      grid: z.strictObject({
        cellSizePx: z.number(),
        offsetXPx: z.number(),
        offsetYPx: z.number(),
      }),
      levels: z.array(
        z.strictObject({
          id: idSchema,
          name: z.string().min(1),
          asset: assetRefSchema.strict().optional(),
        }),
      ),
    })
    .nullable(),
  fog: z.record(
    idSchema,
    z.strictObject({
      revealed: z.array(polygonSchema.strict()),
      remembered: z.array(polygonSchema.strict()),
    }),
  ),
  tokens: z.array(viewerTokenSchema),
  /** Absent when the initiative tracker is not visible or there is no combat. */
  initiative: viewerInitiativeSchema.optional(),
});

export type ApproximateHp = z.infer<typeof approximateHpSchema>;
export type ViewerToken = z.infer<typeof viewerTokenSchema>;
export type ViewerCombatant = z.infer<typeof viewerCombatantSchema>;
export type ViewerInitiative = z.infer<typeof viewerInitiativeSchema>;
export type ViewerScene = z.infer<typeof viewerSceneSchema>;
