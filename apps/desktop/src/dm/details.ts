import type { ResolvedMap } from "@dungeon-manager/core";
import type { Player, Polygon, Scene } from "@dungeon-manager/schema";
import type { TFunction } from "i18next";
import {
  formatDate,
  type NotesIndex,
  type SceneEntry,
  type SessionEntry,
} from "./campaign-data.js";
import { ownNotePath } from "@dungeon-manager/storage";
import type { Details } from "./DetailsPanel.js";
import { fileName, linkedNotes, noteTitle } from "./file-name.js";
import { GROUP, parseTreeId } from "./tree-ids.js";

/** What the details panel can describe (T-159, T-160b). */
export interface DetailsData {
  readonly name: string;
  readonly scenes: readonly SceneEntry[];
  readonly sessions: readonly SessionEntry[];
  readonly players: readonly Player[];
  readonly mapPaths: readonly string[];
  /** Number of default visibility rules in campaign.json. */
  readonly visibilityRules: number;
  /** The open scene as edited, if any. */
  readonly live: {
    readonly scene: Scene;
    readonly map: ResolvedMap | null;
    readonly revealed: readonly Polygon[];
  } | null;
  readonly openSceneId: string | null;
  readonly language: string;
  readonly notesIndex: NotesIndex | null;
  /** Notes linked from campaign.json. */
  readonly campaignLinks: readonly string[];
}

/** "Notizen: 2" – the own note (if it exists) plus the linked ones, each once. */
function notesRow(
  t: TFunction,
  hasOwn: boolean,
  links: readonly string[] | undefined,
  ownPath: string,
) {
  return {
    label: t("shell.details.notes"),
    value: String((hasOwn ? 1 : 0) + linkedNotes(links, ownPath).length),
  };
}

/** The facts of a tree item; `null` for items without any (groups, the scene's content). */
export function describeItem(
  t: TFunction,
  id: string,
  data: DetailsData,
): Details | null {
  const sceneOf = (entry: SceneEntry) =>
    data.live?.scene.id === entry.id ? data.live.scene : entry.scene;
  const item = parseTreeId(id);
  switch (item.kind) {
    case "campaign":
      return campaignDetails(t, data, "shell.details.campaign");
    case "group":
      return item.id === GROUP.settings
        ? campaignDetails(t, data, "shell.tree.settings")
        : null;
    case "session": {
      const session = data.sessions.find(
        (entry) => entry.id === item.sessionId,
      )?.session;
      if (!session) return null;
      const known = new Set(data.scenes.map((entry) => entry.id));
      const missing = session.sceneIds.filter((each) => !known.has(each));
      return {
        kind: t("shell.details.session"),
        name: session.name,
        rows: [
          notesRow(
            t,
            data.notesIndex?.sessions.includes(session.id) ?? false,
            session.notes,
            ownNotePath({ kind: "session", id: session.id }),
          ),
          {
            label: t("shell.details.date"),
            value: session.date
              ? formatDate(session.date, data.language)
              : t("shell.details.none"),
          },
          {
            label: t("shell.details.scenes"),
            value: String(session.sceneIds.length),
          },
          ...(missing.length > 0
            ? [
                {
                  label: t("shell.details.missing"),
                  value: missing.join(", "),
                  mono: true,
                },
              ]
            : []),
        ],
      };
    }
    case "scene": {
      const entry = data.scenes.find((each) => each.id === item.sceneId);
      const scene = entry && sceneOf(entry);
      if (!scene) return null;
      const revealed =
        data.live?.scene.id === scene.id ? data.live.revealed.length : null;
      const liveMap = data.live?.scene.id === scene.id ? data.live.map : null;
      const inSessions = data.sessions
        .filter((each) => each.session?.sceneIds.includes(scene.id))
        .map((each) => each.session?.name ?? each.id);
      return {
        kind: t("shell.details.scene"),
        name: scene.name,
        rows: [
          scene.map
            ? {
                label: t("shell.details.map"),
                value: fileName(scene.map.asset.path),
                mono: true,
              }
            : { label: t("shell.details.map"), value: t("campaign.noMap") },
          // Grid and levels belong to the map (ADR-0012): known for the open scene.
          ...(liveMap
            ? [
                {
                  label: t("shell.details.grid"),
                  value: t("shell.details.cellSize", {
                    px: liveMap.grid.cellSizePx,
                  }),
                },
                {
                  label: t("shell.details.levels"),
                  value: liveMap.levels.map((level) => level.name).join(", "),
                },
              ]
            : []),
          {
            label: t("shell.details.tokens"),
            value: String(scene.tokens.length),
          },
          ...(revealed === null
            ? []
            : [
                {
                  label: t("shell.details.fog"),
                  value: t("shell.browser.fogAreas", { count: revealed }),
                },
              ]),
          {
            label: t("shell.details.sessions"),
            value:
              inSessions.length > 0
                ? inSessions.join(", ")
                : t("shell.tree.unsorted"),
          },
          notesRow(
            t,
            data.notesIndex?.scenes.includes(scene.id) ?? false,
            scene.notes,
            ownNotePath({ kind: "scene", id: scene.id }),
          ),
          {
            label: t("shell.details.state"),
            value:
              data.openSceneId === scene.id
                ? t("shell.details.open")
                : t("shell.details.closed"),
          },
        ],
      };
    }
    case "map": {
      const usedBy = data.scenes
        .map(sceneOf)
        .filter((scene): scene is Scene => scene?.map?.asset.path === item.path)
        .map((scene) => scene.name);
      return {
        kind: t("shell.details.mapKind"),
        name: fileName(item.path),
        rows: [
          { label: t("shell.details.path"), value: item.path, mono: true },
          { label: t("shell.details.usedBy"), value: usedBy.join(", ") },
        ],
      };
    }
    case "player": {
      const player = data.players.find((each) => each.id === item.playerId);
      if (!player) return null;
      return {
        kind: t("shell.details.player"),
        name: player.name,
        rows: [
          {
            label: t("shell.details.character"),
            value: player.characterName ?? t("shell.details.none"),
          },
        ],
      };
    }
    case "note": {
      // A fixed note is named after its owner; a linked one after its file.
      const owner = item.owner;
      const ownerName =
        owner.kind === "campaign"
          ? data.name
          : owner.kind === "session"
            ? data.sessions.find((each) => each.id === owner.id)?.session?.name
            : data.scenes.find((each) => each.id === owner.id)?.scene?.name;
      return {
        kind: t("shell.details.note"),
        name:
          item.path === ownNotePath(owner) && ownerName
            ? ownerName
            : noteTitle(item.path),
        rows: [
          { label: t("shell.details.path"), value: item.path, mono: true },
        ],
      };
    }
    case "missing":
    case "other":
      return null;
  }
}

function campaignDetails(
  t: TFunction,
  data: DetailsData,
  kind: string,
): Details {
  return {
    kind: t(kind),
    name: data.name,
    rows: [
      {
        label: t("shell.details.sessions"),
        value: String(data.sessions.length),
      },
      { label: t("shell.details.scenes"), value: String(data.scenes.length) },
      { label: t("shell.details.maps"), value: String(data.mapPaths.length) },
      { label: t("shell.details.players"), value: String(data.players.length) },
      notesRow(
        t,
        data.notesIndex?.campaign ?? false,
        data.campaignLinks,
        "notes/campaign.md",
      ),
      {
        label: t("shell.details.visibility"),
        value:
          data.visibilityRules === 0
            ? t("shell.details.allVisible")
            : t("shell.details.rules", { count: data.visibilityRules }),
      },
    ],
  };
}
