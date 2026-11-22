import { MigrationError, type Migration, type RawDocument } from "./migrate.js";

// T-119 (DM decision, 2026-11-20): ids became lowercase in version 2 of every document, because
// they name files and `Scene-1.json` and `scene-1.json` are the same file on macOS and Windows.
// The app always generated lowercase ids; only hand-edited version 1 files can hold capitals.
// Every id and every reference to one is lowercased the same way, so references between
// documents (a session's scenes, a sub-scene's parent) keep matching.

type Lower = (value: unknown) => unknown;

/**
 * Lowercases ids and remembers what it saw: two different ids that become equal would merge two
 * things into one, so the document is refused and the DM fixes it by hand.
 */
function lowercaser(): Lower {
  const seen = new Map<string, string>();
  return (value) => {
    if (typeof value !== "string") return value;
    const lower = value.toLowerCase();
    const earlier = seen.get(lower);
    if (earlier !== undefined && earlier !== value)
      throw new MigrationError("idCollision", 1, [earlier, value]);
    seen.set(lower, value);
    return lower;
  };
}

const isRecord = (value: unknown): value is RawDocument =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Applies `change` to `key` of `object` if it is there; anything malformed is left to zod. */
function update(object: unknown, key: string, change: Lower): void {
  if (isRecord(object) && key in object) object[key] = change(object[key]);
}

const each =
  (change: Lower): Lower =>
  (value) =>
    Array.isArray(value) ? value.map(change) : value;

const keysOf =
  (change: Lower): Lower =>
  (value) =>
    isRecord(value)
      ? Object.fromEntries(
          Object.entries(value).map(([key, entry]) => [
            String(change(key)),
            entry,
          ]),
        )
      : value;

function forEach(list: unknown, visit: (item: unknown) => void): void {
  if (Array.isArray(list)) list.forEach(visit);
}

const toVersion2 =
  (
    lowercaseIds: (document: RawDocument, lower: Lower) => void,
  ): Migration["migrate"] =>
  (document) => {
    const lower = lowercaser();
    update(document, "id", lower);
    lowercaseIds(document, lower);
    return { ...document, schemaVersion: 2 };
  };

/** Campaign v1 → v2: lowercase ids. */
export const campaignToVersion2: Migration = {
  from: 1,
  migrate: toVersion2((campaign, lower) => {
    forEach(campaign["players"], (player) => {
      update(player, "id", lower);
    });
  }),
};

/** Scene v1 → v2: lowercase ids of the scene, its levels, tokens, fog, combatants and TV state. */
export const sceneToVersion2: Migration = {
  from: 1,
  migrate: toVersion2((scene, lower) => {
    update(scene, "parentSceneId", lower);
    const map = scene["map"];
    if (isRecord(map))
      forEach(map["levels"], (level) => {
        update(level, "id", lower);
      });
    forEach(scene["tokens"], (token) => {
      for (const key of ["id", "levelId", "ownerPlayerId"])
        update(token, key, lower);
    });
    const fog = scene["fog"];
    update(fog, "levels", keysOf(lower));
    const initiative = scene["initiative"];
    update(initiative, "activeCombatantId", lower);
    update(initiative, "order", each(lower));
    if (isRecord(initiative))
      forEach(initiative["combatants"], (combatant) => {
        update(combatant, "id", lower);
        update(combatant, "tokenId", lower);
      });
    const table = scene["table"];
    update(table, "levelId", lower);
    update(table, "shownLevelIds", each(lower));
  }),
};

/** Session v1 → v2: lowercase ids, including its list of scenes. */
export const sessionToVersion2: Migration = {
  from: 1,
  migrate: toVersion2((session, lower) => {
    update(session, "sceneIds", each(lower));
  }),
};
