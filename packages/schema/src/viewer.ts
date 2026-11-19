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
      /** Only for the host-rendered table view: a companion must never fetch an un-fogged map. */
      asset: assetRefSchema.strict().optional(),
      /** The level on the TV; always one of `levels`. */
      currentLevelId: idSchema,
      grid: z.strictObject({
        cellSizePx: z.number(),
        offsetXPx: z.number(),
        offsetYPx: z.number(),
      }),
      /** The released levels only (shown on the TV so far). */
      levels: z.array(
        z.strictObject({
          id: idSchema,
          name: z.string().min(1),
          asset: assetRefSchema.strict().optional(),
        }),
      ),
    })
    .refine((map) => map.levels.some(({ id }) => id === map.currentLevelId), {
      message: "the current level must be one of the listed levels",
      path: ["currentLevelId"],
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

const viewerEventBase = { at: z.number() };

/** HP after a change: exact when visible to this viewer, else the coarse state – never both. */
const viewerHpChangedSchema = z.union([
  z.strictObject({
    ...viewerEventBase,
    type: z.literal("hp.changed"),
    combatantId: idSchema,
    hp: z.strictObject({ current: z.number().int(), temp: z.number().int() }),
  }),
  z.strictObject({
    ...viewerEventBase,
    type: z.literal("hp.changed"),
    combatantId: idSchema,
    hpState: approximateHpSchema,
  }),
]);

/**
 * A session event as a viewer receives it: the output of `projectEvents` in core. Only events
 * about what the viewer's projected state shows, with no more detail than it (T-117).
 */
export const viewerEventSchema = z.union([
  z.strictObject({
    ...viewerEventBase,
    type: z.literal("token.moved"),
    tokenId: idSchema,
    to: gridCellSchema.strict(),
    levelId: idSchema,
  }),
  z.strictObject({
    ...viewerEventBase,
    type: z.literal("fog.revealed"),
    levelId: idSchema,
  }),
  z.strictObject({
    ...viewerEventBase,
    type: z.literal("fog.hidden"),
    levelId: idSchema,
  }),
  z.strictObject({
    ...viewerEventBase,
    type: z.literal("level.shown"),
    levelId: idSchema,
  }),
  z.strictObject({
    ...viewerEventBase,
    type: z.literal("initiative.combatantAdded"),
    combatantId: idSchema,
  }),
  z.strictObject({
    ...viewerEventBase,
    type: z.literal("initiative.turnStarted"),
    round: z.number().int(),
    combatantId: idSchema,
  }),
  viewerHpChangedSchema,
]);

export type ApproximateHp = z.infer<typeof approximateHpSchema>;
export type ViewerToken = z.infer<typeof viewerTokenSchema>;
export type ViewerCombatant = z.infer<typeof viewerCombatantSchema>;
export type ViewerInitiative = z.infer<typeof viewerInitiativeSchema>;
export type ViewerScene = z.infer<typeof viewerSceneSchema>;
export type ViewerEvent = z.infer<typeof viewerEventSchema>;
