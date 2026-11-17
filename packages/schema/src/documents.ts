import { z } from "zod";
import { idSchema } from "./common.js";
import {
  fogStateSchema,
  initiativeStateSchema,
  mapSchema,
  playerSchema,
  tokenSchema,
  visibilityRuleSchema,
} from "./entities.js";
import type { DocumentType } from "./migrate.js";

// Documents are the JSON files in the library (ARCHITECTURE §6.2): `campaign.json` and one file
// per scene. Only documents carry `schemaVersion`; the entities above are embedded in them.

/** Current version of `campaign.json`. */
export const CAMPAIGN_VERSION = 1;
/** Current version of a scene file. */
export const SCENE_VERSION = 1;

/** `campaigns/<slug>/campaign.json`. */
export const campaignSchema = z.looseObject({
  schemaVersion: z.literal(CAMPAIGN_VERSION),
  id: idSchema,
  name: z.string().min(1),
  players: z.array(playerSchema),
  /** Default player visibility per element type (SPEC §6). */
  visibilityDefaults: z.array(visibilityRuleSchema),
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

export type Campaign = z.infer<typeof campaignSchema>;
export type Scene = z.infer<typeof sceneSchema>;

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
