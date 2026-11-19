import type { Player, Polygon, Scene } from "@dungeon-manager/schema";
import type { TreeNode } from "@dungeon-manager/ui";
import type { TFunction } from "i18next";
import {
  BookOpen,
  CalendarDays,
  CircleAlert,
  Folder,
  Image as ImageIcon,
  NotebookPen,
  ScrollText,
  Settings2,
  UserRound,
  Users,
} from "lucide-react";
import {
  formatDate,
  type SceneEntry,
  type SessionEntry,
} from "./campaign-data.js";
import { fileName } from "./file-name.js";
import { sceneContentNodes } from "./scene-tree.js";
import {
  CAMPAIGN_NODE,
  GROUP,
  mapNodeId,
  missingNodeId,
  playerNodeId,
  sceneNodeId,
  sessionNodeId,
  type SceneSlot,
} from "./tree-ids.js";

/** Everything the campaign tree is built from. */
export interface CampaignTreeData {
  readonly name: string;
  readonly scenes: readonly SceneEntry[] | null;
  readonly sessions: readonly SessionEntry[] | null;
  readonly players: readonly Player[];
  readonly mapPaths: readonly string[];
  /** The open scene as edited, and the tree id under which its content is shown. */
  readonly open: {
    readonly scene: Scene;
    readonly revealed: readonly Polygon[];
    readonly nodeId: string;
  } | null;
  readonly language: string;
}

/** A group that is still empty shows why instead of an empty folder. */
function group(
  id: string,
  label: string,
  icon: TreeNode["icon"],
  children: TreeNode[],
  empty?: string,
): TreeNode {
  return children.length === 0 && empty !== undefined
    ? { id, label, icon, meta: empty }
    : { id, label, icon, children };
}

/** Scene ids that are in at least one readable session. */
export function scenesInSessions(
  sessions: readonly SessionEntry[] | null,
): Set<string> {
  return new Set(
    (sessions ?? []).flatMap((entry) => entry.session?.sceneIds ?? []),
  );
}

/**
 * The browser tree (T-158, T-160b): campaign › Kampagneneinstellungen, Sessions (each with its
 * scenes in order, then "Ohne Session"), Karten, Spieler & Charaktere, Handouts & Hinweise,
 * Notizen. The open scene shows its content under one of its places in the tree.
 */
export function buildCampaignTree(
  t: TFunction,
  data: CampaignTreeData,
): TreeNode {
  const byId = new Map((data.scenes ?? []).map((entry) => [entry.id, entry]));

  const sceneItem = (slot: SceneSlot, entry: SceneEntry): TreeNode => {
    const id = sceneNodeId(slot, entry.id);
    const open =
      data.open?.scene.id === entry.id && data.open.nodeId === id
        ? data.open
        : null;
    return {
      id,
      label: entry.scene
        ? (open?.scene.name ?? entry.scene.name)
        : t(`campaign.scene.${entry.problem ?? "invalid"}`, { id: entry.id }),
      icon: <ScrollText />,
      children: open
        ? sceneContentNodes(t, open.scene, open.revealed)
        : undefined,
    };
  };

  const sessionItems = (data.sessions ?? []).map((entry): TreeNode => {
    if (!entry.session)
      return {
        id: sessionNodeId(entry.id),
        label: t(`shell.tree.session.${entry.problem ?? "invalid"}`, {
          id: entry.id,
        }),
        icon: <CircleAlert />,
      };
    const session = entry.session;
    const scenes = session.sceneIds.map((sceneId): TreeNode => {
      const scene = byId.get(sceneId);
      return scene
        ? sceneItem({ sessionId: session.id }, scene)
        : {
            id: missingNodeId(session.id, sceneId),
            label: t("shell.tree.missingScene", { id: sceneId }),
            icon: <CircleAlert />,
          };
    });
    return {
      ...group(
        sessionNodeId(session.id),
        session.name,
        <CalendarDays />,
        scenes,
        t("shell.tree.emptySession"),
      ),
      ...(session.date && scenes.length > 0
        ? { meta: formatDate(session.date, data.language) }
        : {}),
    };
  });

  const planned = scenesInSessions(data.sessions);
  const unsorted = (data.scenes ?? [])
    .filter((entry) => !planned.has(entry.id))
    .map((entry) => sceneItem("unsorted", entry));

  return {
    id: CAMPAIGN_NODE,
    label: data.name,
    icon: <BookOpen />,
    children: [
      {
        id: GROUP.settings,
        label: t("shell.tree.settings"),
        icon: <Settings2 />,
      },
      {
        id: GROUP.sessions,
        label: t("shell.tree.sessions"),
        icon: <Folder />,
        children: [
          ...sessionItems,
          group(
            GROUP.unsorted,
            t("shell.tree.unsorted"),
            <Folder />,
            unsorted,
            data.scenes === null
              ? undefined
              : data.scenes.length === 0
                ? t("shell.tree.noScenes")
                : t("shell.tree.allPlanned"),
          ),
        ],
      },
      group(
        GROUP.maps,
        t("shell.tree.maps"),
        <Folder />,
        data.mapPaths.map((path) => ({
          id: mapNodeId(path),
          label: fileName(path),
          icon: <ImageIcon />,
          mono: true,
        })),
        t("shell.tree.noMaps"),
      ),
      group(
        GROUP.players,
        t("shell.tree.players"),
        <Users />,
        data.players.map((player) => ({
          id: playerNodeId(player.id),
          label: player.name,
          icon: <UserRound />,
          meta: player.characterName,
        })),
        t("shell.tree.noPlayers"),
      ),
      group(
        GROUP.handouts,
        t("shell.tree.handouts"),
        <Folder />,
        [],
        t("shell.tree.noHandouts"),
      ),
      group(
        GROUP.notes,
        t("shell.tree.notes"),
        <NotebookPen />,
        [],
        t("shell.tree.noNotes"),
      ),
    ],
  };
}
