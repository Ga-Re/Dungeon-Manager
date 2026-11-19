import { z } from "zod";
import { idSchema } from "./common.js";
import {
  fogStateSchema,
  initiativeStateSchema,
  mapSchema,
  playerSchema,
  tokenSchema,
  visibilityRulesSchema,
} from "./entities.js";
import type { DocumentType } from "./migrate.js";

// Documents are the JSON files in the library (ARCHITECTURE §6.2): `campaign.json` and one file
// per scene. Only documents carry `schemaVersion`; the entities above are embedded in them.

/** Current version of `campaign.json`. */
export const CAMPAIGN_VERSION = 1;
/** Current version of a scene file. */
export const SCENE_VERSION = 1;
/** Current version of a session file. */
export const SESSION_VERSION = 1;

/** `campaigns/<slug>/campaign.json`. */
export const campaignSchema = z.looseObject({
  schemaVersion: z.literal(CAMPAIGN_VERSION),
  id: idSchema,
  name: z.string().min(1),
  players: z.array(playerSchema),
  /** Default player visibility per element type (SPEC §6); missing types are visible. */
  visibilityDefaults: visibilityRulesSchema,
});

/** `campaigns/<slug>/scenes/<id>.json`. */
export const sceneSchema = z.looseObject({
  schemaVersion: z.literal(SCENE_VERSION),
  id: idSchema,
  name: z.string().min(1),
  map: mapSchema.nullable(),
  tokens: z.array(tokenSchema),
  fog: fogStateSchema,
  initiative: initiativeStateSchema.nullable(),
});

/** A calendar day as `YYYY-MM-DD` that really exists (no 30 February). */
const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const date = new Date(`${value}T00:00:00Z`);
    return (
      !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value)
    );
  }, "Not a calendar date");

/**
 * `campaigns/<slug>/sessions/<id>.json` (T-160): a planned game session with its scenes in
 * order. A scene appears at most once per session but may be in several sessions; scene files
 * do not point back, so a session can name a scene that is missing (e.g. not synced yet).
 */
export const sessionSchema = z.looseObject({
  schemaVersion: z.literal(SESSION_VERSION),
  id: idSchema,
  name: z.string().min(1),
  date: isoDateSchema.optional(),
  sceneIds: z
    .array(idSchema)
    .refine((ids) => new Set(ids).size === ids.length, "Duplicate scene"),
});

export type Campaign = z.infer<typeof campaignSchema>;
export type Scene = z.infer<typeof sceneSchema>;
export type Session = z.infer<typeof sessionSchema>;

/** Reading `campaign.json`: migrations from older versions, then validation. */
export const campaignDocument: DocumentType<Campaign> = {
  schema: campaignSchema,
  latestVersion: CAMPAIGN_VERSION,
  migrations: [],
};

/** Reading a scene file: migrations from older versions, then validation. */
export const sceneDocument: DocumentType<Scene> = {
  schema: sceneSchema,
  latestVersion: SCENE_VERSION,
  migrations: [],
};

/** Reading a session file: migrations from older versions, then validation. */
export const sessionDocument: DocumentType<Session> = {
  schema: sessionSchema,
  latestVersion: SESSION_VERSION,
  migrations: [],
};
