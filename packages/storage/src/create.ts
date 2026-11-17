import {
  CAMPAIGN_VERSION,
  SCENE_VERSION,
  type Scene,
} from "@dungeon-manager/schema";
import { listCampaigns, saveCampaign, saveScene } from "./documents.js";
import type { FileSystem } from "./fs.js";
import { isValidSlug } from "./layout.js";

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
 * gets a number if the folder is taken. @returns the slug. @throws on an empty name
 */
export async function createCampaign(
  fs: FileSystem,
  campaign: { readonly id: string; readonly name: string },
): Promise<string> {
  const name = campaign.name.trim();
  if (name === "") throw new Error("A campaign needs a name");
  const taken = new Set(await listCampaigns(fs));
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

/** Creates and saves an empty scene (no map yet). @returns the saved scene */
export async function createScene(
  fs: FileSystem,
  slug: string,
  scene: { readonly id: string; readonly name: string },
): Promise<Scene> {
  const created: Scene = {
    schemaVersion: SCENE_VERSION,
    id: scene.id,
    name: scene.name.trim(),
    map: null,
    tokens: [],
    fog: { levels: {} },
    initiative: null,
  };
  await saveScene(fs, slug, created);
  return created;
}
