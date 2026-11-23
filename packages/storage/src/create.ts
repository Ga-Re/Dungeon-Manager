import {
  CAMPAIGN_VERSION,
  SCENE_VERSION,
  SESSION_VERSION,
  SIDECAR_VERSION,
  itemInfoSchema,
  type AssetRef,
  type ItemInfo,
  type Grid,
  type MapData,
  type MapKind,
  type Scene,
  type SceneMap,
  type Sidecar,
  type SidecarLevel,
  type Session,
} from "@dungeon-manager/schema";
import {
  listSessions,
  loadScene,
  loadSession,
  loadSidecar,
  saveCampaign,
  saveScene,
  saveSession,
  saveSidecar,
} from "./documents.js";
import type { FileSystem } from "./fs.js";
import {
  isValidFileId,
  isValidSlug,
  sceneFile,
  sessionFile,
} from "./layout.js";

const TRANSLITERATIONS: Readonly<Record<string, string>> = {
  ä: "ae",
  ö: "oe",
  ü: "ue",
  ß: "ss",
};

/**
 * A folder name for a campaign: lowercase ASCII, digits and dashes, at most 64 characters.
 * German umlauts are spelled out, other accents dropped; never empty or a reserved name.
 */
export function slugify(name: string): string {
  const slug = name
    // Composed first, so a decomposed "u" + U+0308 (macOS file names, pasted text) is an "ü".
    .normalize("NFC")
    .toLowerCase()
    .replace(/[äöüß]/g, (letter) => TRANSLITERATIONS[letter] ?? letter)
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .slice(0, 64)
    .replace(/^-+|-+$/g, "");
  if (slug === "") return "campaign";
  return isValidSlug(slug) ? slug : `${slug}-campaign`;
}

/**
 * Creates `campaigns/<slug>/campaign.json` for a new campaign; the slug comes from the name and
 * gets a number if a folder or file of that name (in any case) exists. @returns the slug.
 * @throws on an empty name
 */
export async function createCampaign(
  fs: FileSystem,
  campaign: { readonly id: string; readonly name: string },
): Promise<string> {
  const name = campaign.name.trim();
  if (name === "") throw new Error("A campaign needs a name");
  // Every existing folder counts, compared case-insensitively: on macOS/Windows "Mine" and
  // "mine" are the same folder, and overwriting its campaign.json would lose data.
  const entries = (await fs.list("campaigns")) ?? [];
  const taken = new Set(entries.map((entry) => entry.name.toLowerCase()));
  const base = slugify(name);
  let slug = base;
  for (let number = 2; taken.has(slug); number++) {
    const suffix = `-${String(number)}`;
    slug = `${base.slice(0, 64 - suffix.length).replace(/-+$/, "")}${suffix}`;
  }
  await saveCampaign(fs, slug, {
    schemaVersion: CAMPAIGN_VERSION,
    id: campaign.id,
    name,
    players: [],
    visibilityDefaults: {},
  });
  return slug;
}

/**
 * Creates and saves a scene, empty or with a map; no tokens, fog or initiative yet. A map
 * without map data in its sidecar gets a placeholder grid and one level (`ensureMapData`).
 * @returns the saved scene. @throws on an empty name, an invalid map or a map whose sidecar is
 *   not available
 */
export async function createScene(
  fs: FileSystem,
  slug: string,
  scene: {
    readonly id: string;
    readonly name: string;
    /** `levelName`: the translated name of the first level of a map without data. */
    readonly map?: {
      readonly asset: AssetRef;
      readonly levelName: string;
    } | null;
    /** Makes it a sub-scene of this scene (T-152). */
    readonly parentSceneId?: string | undefined;
  },
): Promise<Scene> {
  if (scene.name.trim() === "") throw new Error("A scene needs a name");
  if (scene.map)
    await ensureMapData(fs, scene.map.asset, newMapData(scene.map.levelName));
  const created: Scene = {
    schemaVersion: SCENE_VERSION,
    id: scene.id,
    name: scene.name.trim(),
    map: scene.map ? sceneMapOf(scene.map.asset) : null,
    tokens: [],
    fog: { levels: {} },
    initiative: null,
    ...(scene.parentSceneId ? { parentSceneId: scene.parentSceneId } : {}),
  };
  await saveScene(fs, slug, created);
  return created;
}

/** What to reset when a scene gets a different map; everything not set is kept. */
export interface MapReset {
  /** Cover the whole map again (fog is stored in map pixels). */
  readonly fog?: boolean;
  /**
   * Back to the placeholder grid, to be calibrated again – for a map that has no map data yet
   * (`mapDataForChange`); a map's own calibration is never reset by a scene (ADR-0012).
   */
  readonly grid?: boolean;
  /** Remove the tokens, and initiative entries tied to them. */
  readonly tokens?: boolean;
}

/** A fresh placeholder grid per scene (never a shared object). */
const placeholderGrid = () => ({ cellSizePx: 100, offsetXPx: 0, offsetYPx: 0 });

/**
 * The scene with `asset` as its map. Its fog and tokens are kept by default (right for a
 * corrected version of the same map); `reset` clears what no longer fits. Overrides referred to
 * the old map's elements and are dropped. The new map's data comes from `mapDataForChange`.
 */
export function withMap(
  scene: Scene,
  asset: AssetRef,
  reset: MapReset = {},
): Scene {
  const changed: Scene = { ...scene, map: sceneMapOf(asset) };
  if (reset.fog === true) changed.fog = { ...scene.fog, levels: {} };
  if (reset.tokens === true) {
    changed.tokens = [];
    changed.initiative = withoutTokenCombatants(scene.initiative);
  }
  return changed;
}

/**
 * The map data a new map starts with when a scene changes to it: the old map's levels and, unless
 * `reset.grid`, its grid – so fog and tokens fit a corrected version of the same map – or a
 * single new level without an old map. `current` is the old map as the scene played it, defaults
 * included. Used only if the new map has no data yet.
 */
export function mapDataForChange(
  current: {
    readonly grid: Grid;
    readonly levels: readonly SidecarLevel[];
  } | null,
  levelName: string,
  reset: MapReset = {},
): MapData {
  if (!current) return newMapData(levelName);
  return {
    grid: reset.grid === true ? placeholderGrid() : current.grid,
    levels: [...current.levels],
    areas: [],
  };
}

/** The initiative without combatants that stood for a token (their token is gone). */
function withoutTokenCombatants(
  initiative: Scene["initiative"],
): Scene["initiative"] {
  if (!initiative) return initiative;
  const combatants = initiative.combatants.filter(
    (combatant) => combatant.tokenId === undefined,
  );
  const kept = new Set(combatants.map((combatant) => combatant.id));
  const order = initiative.order.filter((id) => kept.has(id));
  // Like ending combat in core: with nobody left, the next fight starts at round 1 again.
  if (order.length === 0)
    return {
      ...initiative,
      round: 0,
      activeCombatantId: null,
      order: [],
      combatants,
    };
  // Unlike core's removal, the turn does not pass on: the map changed, so the DM decides.
  return {
    ...initiative,
    combatants,
    order,
    activeCombatantId:
      initiative.activeCombatantId !== null &&
      kept.has(initiative.activeCombatantId)
        ? initiative.activeCombatantId
        : null,
  };
}

/** Video maps (ADR-0010) by file extension; the import checks the content when copying. */
export function mapKind(path: string): MapKind {
  return /\.(mp4|webm)$/i.test(path) ? "video" : "image";
}

/** A scene's reference to a map file (scene version 3): image or video by file type. */
export function sceneMapOf(asset: AssetRef): SceneMap {
  return {
    kind: mapKind(asset.path),
    asset: { path: asset.path, hash: asset.hash },
    overrides: {},
  };
}

/**
 * The id of the single level of a map without data. Fixed, so fog and tokens on a map played with
 * defaults still fit once its sidecar is written.
 */
export const DEFAULT_LEVEL_ID = "level-1";

/**
 * A map's data before it is calibrated (T-106): 100 px per cell and a single level, the same the
 * DM window plays for a map without data (`DEFAULT_LEVEL_ID`).
 */
export function newMapData(levelName: string): MapData {
  return {
    grid: placeholderGrid(),
    levels: [{ id: DEFAULT_LEVEL_ID, name: levelName }],
    areas: [],
  };
}

/** A map's sidecar is not downloaded yet, unreadable or broken, so its data cannot be used. */
export class MapDataUnavailableError extends Error {
  constructor(readonly assetPath: string) {
    super(`The map data of ${assetPath} is not available`);
    this.name = "MapDataUnavailableError";
  }
}

/**
 * Makes sure a map file has map data in its sidecar (ADR-0012): a missing sidecar, or one without
 * map data, gets `data`; existing map data is kept, so a map is calibrated once for every scene.
 * @returns the map data in effect. @throws when the sidecar is not downloaded yet, unreadable or
 *   broken – it is never overwritten
 */
export async function ensureMapData(
  fs: FileSystem,
  asset: AssetRef,
  data: MapData,
): Promise<MapData> {
  const loaded = await loadSidecar(fs, asset.path);
  if (loaded.status === "ok" && loaded.value.map) return loaded.value.map;
  if (loaded.status !== "ok" && loaded.status !== "missing")
    throw new MapDataUnavailableError(asset.path);
  await saveSidecar(fs, asset.path, {
    ...(loaded.status === "ok"
      ? loaded.value
      : { schemaVersion: SIDECAR_VERSION, original: { hash: asset.hash } }),
    map: data,
  });
  return data;
}

/**
 * Makes a scene a sub-scene of `parentSceneId`, or a top-level scene with `null` (T-152), e.g.
 * when its parent is deleted and the DM keeps its sub-scenes. Everything else in the file is
 * kept as it is. @throws when the scene cannot be read or written
 */
export async function reparentScene(
  fs: FileSystem,
  slug: string,
  sceneId: string,
  parentSceneId: string | null,
): Promise<Scene> {
  const loaded = await loadScene(fs, slug, sceneId);
  if (loaded.status !== "ok")
    throw new Error(`Scene ${sceneId} cannot be read (${loaded.status})`);
  const next: Scene = { ...loaded.value };
  if (parentSceneId) next.parentSceneId = parentSceneId;
  else delete next.parentSceneId;
  await saveScene(fs, slug, next);
  return next;
}

/**
 * Moves a scene file into the campaign's trash and takes it out of every session that lists it
 * (sessions without it are not rewritten). Updating the sessions is best effort: the scene is
 * already gone, so a session that cannot be read, listed or written keeps the id and shows it
 * as missing. A session whose file name differs from its `id` (renamed by hand) is skipped, so
 * it never overwrites another session's file (ARCHITECTURE §6.3).
 * @returns its path in the trash. @throws on unsafe input or when the trash move fails
 */
export async function deleteScene(
  fs: FileSystem,
  slug: string,
  sceneId: string,
): Promise<string> {
  if (!isValidSlug(slug)) throw new Error(`Invalid campaign slug: ${slug}`);
  if (!isValidFileId(sceneId)) throw new Error(`Invalid scene id: ${sceneId}`);
  const trashed = await fs.moveToTrash(sceneFile(slug, sceneId));
  const sessionIds = await listSessions(fs, slug).then(
    (listed) => listed.sessionIds,
    () => [],
  );
  for (const id of sessionIds) {
    const loaded = await loadSession(fs, slug, id);
    if (
      loaded.status !== "ok" ||
      loaded.value.id !== id ||
      !loaded.value.sceneIds.includes(sceneId)
    )
      continue;
    await saveSession(fs, slug, {
      ...loaded.value,
      sceneIds: loaded.value.sceneIds.filter((each) => each !== sceneId),
    }).catch(() => undefined);
  }
  return trashed;
}

/**
 * Creates and saves an empty session (T-160). @returns the saved session.
 * @throws on an empty name or an invalid date
 */
export async function createSession(
  fs: FileSystem,
  slug: string,
  session: {
    readonly id: string;
    readonly name: string;
    readonly date?: string;
  },
): Promise<Session> {
  if (session.name.trim() === "") throw new Error("A session needs a name");
  const created: Session = {
    schemaVersion: SESSION_VERSION,
    id: session.id,
    name: session.name.trim(),
    ...(session.date === undefined ? {} : { date: session.date }),
    sceneIds: [],
  };
  await saveSession(fs, slug, created);
  return created;
}

/** Moves a session file into the campaign's trash; its scenes stay. @returns its path there */
export async function deleteSession(
  fs: FileSystem,
  slug: string,
  sessionId: string,
): Promise<string> {
  if (!isValidSlug(slug)) throw new Error(`Invalid campaign slug: ${slug}`);
  if (!isValidFileId(sessionId))
    throw new Error(`Invalid session id: ${sessionId}`);
  return fs.moveToTrash(sessionFile(slug, sessionId));
}

/** The map's data on disk is no longer what the DM sees (changed elsewhere meanwhile). */
export class MapDataChangedError extends Error {
  constructor(readonly assetPath: string) {
    super(`The map data of ${assetPath} changed meanwhile`);
    this.name = "MapDataChangedError";
  }
}

/**
 * Changes a map's global data in its sidecar (e.g. a new level, T-118d): `change` gets the map's
 * data – `defaults` while it has none – and returns the new data, or `null` to write nothing.
 * `expected` is the data the DM sees: if the sidecar holds something else, a change from
 * elsewhere has not reached them yet (it waits for confirmation, ADR-0012) and nothing is written.
 * @returns the data written, or `null`. @throws `MapDataUnavailableError` when the sidecar is not
 *   downloaded yet, unreadable or broken – it is never overwritten; `MapDataChangedError`
 */
export async function updateMapData(
  fs: FileSystem,
  asset: AssetRef,
  defaults: MapData,
  change: (data: MapData) => MapData | null,
  expected?: MapData,
): Promise<MapData | null> {
  const loaded = await loadSidecar(fs, asset.path);
  if (loaded.status !== "ok" && loaded.status !== "missing")
    throw new MapDataUnavailableError(asset.path);
  const sidecar: Sidecar =
    loaded.status === "ok"
      ? loaded.value
      : { schemaVersion: SIDECAR_VERSION, original: { hash: asset.hash } };
  const current = sidecar.map ?? defaults;
  if (expected && JSON.stringify(current) !== JSON.stringify(expected))
    throw new MapDataChangedError(asset.path);
  const next = change(current);
  if (!next) return null;
  await saveSidecar(fs, asset.path, { ...sidecar, map: next });
  return next;
}

/** The fields of an item's info the DM edits (T-125); blank ones are left out of the file. */
export interface ItemInfoInput {
  readonly name?: string | undefined;
  readonly origin?: string | undefined;
  readonly license?: string | undefined;
}

/**
 * Sets a catalog item's name and origin/license in its sidecar (T-125), creating the sidecar if
 * the file has none; everything else in it is kept. Texts are trimmed, blank ones left out.
 * `expected` is the info the DM began editing from: if the sidecar holds another (a change from
 * another device or by hand meanwhile), nothing is written.
 * @returns the info written. @throws `MapDataUnavailableError` when the sidecar is not
 *   downloaded yet, unreadable or broken – it is never overwritten; `MapDataChangedError`; on
 *   invalid input
 */
export async function updateItemInfo(
  fs: FileSystem,
  asset: AssetRef,
  input: ItemInfoInput,
  expected?: ItemInfoInput,
): Promise<ItemInfo> {
  const loaded = await loadSidecar(fs, asset.path);
  if (loaded.status !== "ok" && loaded.status !== "missing")
    throw new MapDataUnavailableError(asset.path);
  const sidecar: Sidecar =
    loaded.status === "ok"
      ? loaded.value
      : { schemaVersion: SIDECAR_VERSION, original: { hash: asset.hash } };
  if (expected && editedFields(sidecar.info ?? {}) !== editedFields(expected))
    throw new MapDataChangedError(asset.path);
  // Fields this app does not know yet (loose schema) stay as they are; the three it edits are
  // replaced by the input.
  const info: Record<string, unknown> = Object.fromEntries(
    Object.entries(sidecar.info ?? {}).filter(
      ([key]) => key !== "name" && key !== "origin" && key !== "license",
    ),
  );
  for (const key of ["name", "origin", "license"] as const) {
    const value = input[key]?.trim() ?? "";
    if (value !== "") info[key] = value;
  }
  const parsed = itemInfoSchema.parse(info);
  await saveSidecar(fs, asset.path, { ...sidecar, info: parsed });
  return parsed;
}

/** The three fields the DM edits, trimmed, as one comparable string. */
function editedFields(info: ItemInfoInput): string {
  return JSON.stringify(
    (["name", "origin", "license"] as const).map(
      (key) => info[key]?.trim() ?? "",
    ),
  );
}
