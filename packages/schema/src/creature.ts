import { z } from "zod";
import { assetRefSchema, idSchema } from "./common.js";
import { tokenSizeSchema } from "./entities.js";
import type { DocumentType } from "./migrate.js";

// Creatures (T-180a, ADR-0018; format agreed with the DM, 2026-11-20): global ones in
// `library/creatures/<folders>/<id>.json`, player characters in the same format in
// `campaigns/<slug>/characters/<id>.json`. A lean D&D 5e core the app uses; everything else goes
// into the stat block (Markdown) and the DM's own fields. Loose schemas keep what a newer app adds.

/** Current version of a creature file. */
export const CREATURE_VERSION = 1;

/** A distance in feet, as 5e gives them (speeds, senses). */
const feetSchema = z.number().int().nonnegative();

/** Hit points: a value and/or the dice formula they come from (e.g. `2d8+4`). */
export const creatureHpSchema = z.looseObject({
  value: z.number().int().nonnegative().optional(),
  formula: z.string().min(1).optional(),
});

/** Speeds in feet; a missing one means the creature cannot move that way. */
export const speedsSchema = z.looseObject({
  walk: feetSchema.optional(),
  fly: feetSchema.optional(),
  swim: feetSchema.optional(),
  climb: feetSchema.optional(),
  burrow: feetSchema.optional(),
});

/** The 5e senses vision uses, as ranges in feet (normal sight depends on light). */
export const sensesSchema = z.looseObject({
  darkvision: feetSchema.optional(),
  blindsight: feetSchema.optional(),
  tremorsense: feetSchema.optional(),
  truesight: feetSchema.optional(),
});

/**
 * A footprint other than the size's own, in grid cells (e.g. 2 × 4 for a wagon). Tiny creatures
 * share a cell; a footprint always covers whole cells.
 */
export const footprintSchema = z.looseObject({
  cols: z.number().int().positive(),
  rows: z.number().int().positive(),
});

/** A point in a footprint, in cells from its top left corner (the centre by default). */
export const pivotSchema = z.looseObject({
  x: z.number().nonnegative(),
  y: z.number().nonnegative(),
});

/** How the creature looks on the map. */
export const creatureLookSchema = z.looseObject({
  token: assetRefSchema.optional(),
  portrait: assetRefSchema.optional(),
  /** A round token with a ring, or a cut-out figure seen from above. */
  style: z.enum(["round", "cutout"]),
  /** The faction ring's colour (`#rrggbb`), for round tokens. */
  faction: z
    .string()
    .regex(/^#[0-9a-f]{6}$/i)
    .optional(),
  /** Size of the picture relative to the footprint (1: it fills it). */
  scale: z.number().positive().optional(),
  /** Shift of the picture, in cells. */
  offset: z.looseObject({ x: z.number(), y: z.number() }).optional(),
});

/** One of the DM's own fields. */
export const customFieldSchema = z.looseObject({
  name: z.string().min(1),
  value: z.union([z.string(), z.number()]),
});

/** A creature or player character file. */
export const creatureSchema = z.looseObject({
  schemaVersion: z.literal(CREATURE_VERSION),
  id: idSchema,
  name: z.string().min(1),
  /** E.g. "Untoter", as the DM writes it. */
  type: z.string().min(1).optional(),
  /** Challenge rating as written in 5e ("1/4", "5"). */
  challenge: z.string().min(1).optional(),
  size: tokenSizeSchema,
  footprint: footprintSchema.optional(),
  pivot: pivotSchema.optional(),
  hp: creatureHpSchema.optional(),
  ac: z.number().int().nonnegative().optional(),
  initiativeModifier: z.number().int().optional(),
  speeds: speedsSchema.optional(),
  senses: sensesSchema.optional(),
  look: creatureLookSchema,
  fields: z.array(customFieldSchema).optional(),
  /** Actions, spells and tactics (Markdown). */
  statBlock: z.string().optional(),
  /** For a player character: the campaign's player it belongs to. */
  playerId: idSchema.optional(),
});

export type Creature = z.infer<typeof creatureSchema>;
export type CreatureLook = z.infer<typeof creatureLookSchema>;
export type Footprint = z.infer<typeof footprintSchema>;

/** Reading a creature file: migrations from older versions (none yet), then validation. */
export const creatureDocument: DocumentType<Creature> = {
  schema: creatureSchema,
  latestVersion: CREATURE_VERSION,
  migrations: [],
};
