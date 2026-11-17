import {
  CAMPAIGN_VERSION,
  SCENE_VERSION,
  type AssetRef,
  type MapSpec,
  type Scene,
} from "@dungeon-manager/schema";
import { saveCampaign, saveScene } from "./documents.js";
import type { FileSystem } from "./fs.js";
import { isValidFileId, isValidSlug, sceneFile } from "./layout.js";

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
 * Creates and saves a scene, empty or with a map; no tokens, fog or initiative yet.
 * @returns the saved scene. @throws on an empty name or an invalid map
 */
export async function createScene(
  fs: FileSystem,
  slug: string,
  scene: {
    readonly id: string;
    readonly name: string;
    readonly map?: MapSpec | null;
  },
): Promise<Scene> {
  if (scene.name.trim() === "") throw new Error("A scene needs a name");
  const created: Scene = {
    schemaVersion: SCENE_VERSION,
    id: scene.id,
    name: scene.name.trim(),
    map: scene.map ?? null,
    tokens: [],
    fog: { levels: {} },
    initiative: null,
  };
  await saveScene(fs, slug, created);
  return created;
}

/** What to reset when a scene gets a different map; everything not set is kept. */
export interface MapReset {
  /** Cover the whole map again (fog is stored in map pixels). */
  readonly fog?: boolean;
  /** Back to the placeholder grid, to be calibrated again. */
  readonly grid?: boolean;
  /** Remove the tokens, and initiative entries tied to them. */
  readonly tokens?: boolean;
}

const PLACEHOLDER_GRID = { cellSizePx: 100, offsetXPx: 0, offsetYPx: 0 };

/**
 * The scene with `asset` as its map image. An existing map keeps its levels, and by default its
 * grid, fog and tokens (right for a corrected version of the same map); `reset` clears what no
 * longer fits. A scene without a map gets a single-level image map (`imageMap`).
 */
export function withMap(
  scene: Scene,
  asset: AssetRef,
  newLevel: { readonly id: string; readonly name: string },
  reset: MapReset = {},
): Scene {
  const map: MapSpec = scene.map
    ? {
        ...scene.map,
        kind: "image",
        asset: { path: asset.path, hash: asset.hash },
        ...(reset.grid === true && { grid: PLACEHOLDER_GRID }),
      }
    : imageMap(asset, newLevel);
  const changed: Scene = { ...scene, map };
  if (reset.fog === true) changed.fog = { ...scene.fog, levels: {} };
  if (reset.tokens === true) {
    changed.tokens = [];
    changed.initiative = withoutTokenCombatants(scene.initiative);
  }
  return changed;
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

/** A single-level image map with a placeholder grid (100 px per cell) until it is calibrated (T-106). */
export function imageMap(
  asset: AssetRef,
  level: { readonly id: string; readonly name: string },
): MapSpec {
  return {
    kind: "image",
    asset: { path: asset.path, hash: asset.hash },
    grid: PLACEHOLDER_GRID,
    levels: [{ id: level.id, name: level.name }],
  };
}

/** Moves a scene file into the campaign's trash. @returns its path there. @throws on unsafe input */
export async function deleteScene(
  fs: FileSystem,
  slug: string,
  sceneId: string,
): Promise<string> {
  if (!isValidSlug(slug)) throw new Error(`Invalid campaign slug: ${slug}`);
  if (!isValidFileId(sceneId)) throw new Error(`Invalid scene id: ${sceneId}`);
  return fs.moveToTrash(sceneFile(slug, sceneId));
}
