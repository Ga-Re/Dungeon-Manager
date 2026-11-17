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

/**
 * The scene with `asset` as its map image. An existing map keeps its levels, grid, fog and
 * tokens (the usual case is a corrected version of the same map); a scene without a map gets a
 * single-level image map (`imageMap`).
 */
export function withMap(
  scene: Scene,
  asset: AssetRef,
  newLevel: { readonly id: string; readonly name: string },
): Scene {
  const map: MapSpec = scene.map
    ? {
        ...scene.map,
        kind: "image",
        asset: { path: asset.path, hash: asset.hash },
      }
    : imageMap(asset, newLevel);
  return { ...scene, map };
}

/** A single-level image map with a placeholder grid (100 px per cell) until it is calibrated (T-106). */
export function imageMap(
  asset: AssetRef,
  level: { readonly id: string; readonly name: string },
): MapSpec {
  return {
    kind: "image",
    asset: { path: asset.path, hash: asset.hash },
    grid: { cellSizePx: 100, offsetXPx: 0, offsetYPx: 0 },
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
