// Recently edited campaigns for the welcome dialog (T-153). Kept per device in the webview's
// storage (OS app data, like the theme) – not in the synced library, so no file format changes.

/** A campaign the DM worked on, in the library folder it lives in. */
export interface RecentCampaign {
  /** The library folder; the same slug in another library is another campaign. */
  readonly root: string;
  readonly slug: string;
  /** Its name when last opened, shown even if the campaign is gone now. */
  readonly name: string;
  /** The scene open last, opened again with the campaign. */
  readonly sceneId: string | null;
  readonly sceneName: string | null;
  /** When it was last opened (ISO 8601). */
  readonly openedAt: string;
}

/** Where a campaign is: its library folder and slug. */
export interface CampaignRef {
  readonly root: string;
  readonly slug: string;
}

/** How many campaigns the list keeps. */
export const MAX_RECENT = 8;

const STORAGE_KEY = "dm.recentCampaigns";

const isSame = (entry: CampaignRef, ref: CampaignRef) =>
  entry.root === ref.root && entry.slug === ref.slug;

const isText = (value: unknown): value is string => typeof value === "string";
const isTextOrNull = (value: unknown) => value === null || isText(value);

function isRecent(value: unknown): value is RecentCampaign {
  if (typeof value !== "object" || value === null) return false;
  const entry = value as Record<string, unknown>;
  return (
    isText(entry["root"]) &&
    isText(entry["slug"]) &&
    isText(entry["name"]) &&
    isTextOrNull(entry["sceneId"]) &&
    isTextOrNull(entry["sceneName"]) &&
    isText(entry["openedAt"])
  );
}

/** The stored list, most recent first; unreadable entries are skipped (storage is an edge). */
export function readRecent(storage: Storage | undefined): RecentCampaign[] {
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    if (!raw) return [];
    const value: unknown = JSON.parse(raw);
    return Array.isArray(value) ? value.filter(isRecent) : [];
  } catch {
    return [];
  }
}

export function saveRecent(
  storage: Storage | undefined,
  list: readonly RecentCampaign[],
): void {
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    // Not persisted (e.g. storage disabled); the list still holds until the window closes.
  }
}

/** The list with `campaign` first, opened at `now`; its last scene is kept. */
export function recordCampaign(
  list: readonly RecentCampaign[],
  campaign: CampaignRef & { readonly name: string },
  now: Date,
): RecentCampaign[] {
  const previous = list.find((entry) => isSame(entry, campaign));
  const entry: RecentCampaign = {
    root: campaign.root,
    slug: campaign.slug,
    name: campaign.name,
    sceneId: previous?.sceneId ?? null,
    sceneName: previous?.sceneName ?? null,
    openedAt: now.toISOString(),
  };
  return [entry, ...list.filter((each) => !isSame(each, campaign))].slice(
    0,
    MAX_RECENT,
  );
}

/** Remembers the scene opened in a listed campaign; other lists stay as they are. */
export function recordScene(
  list: readonly RecentCampaign[],
  campaign: CampaignRef,
  scene: { readonly id: string; readonly name: string },
  now: Date,
): RecentCampaign[] {
  return list.map((entry) =>
    isSame(entry, campaign)
      ? {
          ...entry,
          sceneId: scene.id,
          sceneName: scene.name,
          openedAt: now.toISOString(),
        }
      : entry,
  );
}

export function forgetCampaign(
  list: readonly RecentCampaign[],
  campaign: CampaignRef,
): RecentCampaign[] {
  return list.filter((entry) => !isSame(entry, campaign));
}

/** The campaigns of one library folder, most recent first. */
export function recentIn(
  list: readonly RecentCampaign[],
  root: string,
): RecentCampaign[] {
  return list.filter((entry) => entry.root === root);
}
