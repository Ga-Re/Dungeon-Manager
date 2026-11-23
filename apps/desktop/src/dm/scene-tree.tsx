import {
  areasOnLevel,
  tableLevels,
  type ResolvedMap,
} from "@dungeon-manager/core";
import type { Polygon, Scene } from "@dungeon-manager/schema";
import type { TreeNode } from "@dungeon-manager/ui";
import type { TFunction } from "i18next";
import { Cloud, DoorOpen, Layers, Map as MapIcon, Tv } from "lucide-react";
import { fileName } from "./file-name.js";

/** Tree ids of the open scene's content, kept apart from scene ids (`scene:<id>`). */
const CONTENT = "content:";

/**
 * The open scene's content in the scene browser (ADR-0011): its map with levels and its fog.
 * Grows with tokens and notes in later tasks.
 */
export function sceneContentNodes(
  t: TFunction,
  scene: Scene,
  map: ResolvedMap | null,
  revealed: readonly Polygon[],
): TreeNode[] {
  const { current, released } = tableLevels(scene, map);
  // Which levels the TV shows and the players have seen (T-118c); with one level there is
  // nothing to tell apart, as with the level switcher.
  const levelMeta = (id: string) =>
    (map?.levels.length ?? 0) < 2 ? undefined : id === current ? (
      <span className="dm-level-on-tv">
        <Tv aria-hidden="true" />
        {t("shell.browser.levelOnTv")}
      </span>
    ) : released.has(id) ? (
      t("shell.browser.levelReleased")
    ) : undefined;
  const mapNode: TreeNode = scene.map
    ? {
        id: `${CONTENT}map`,
        label: t("shell.browser.map"),
        icon: <MapIcon />,
        children: [
          {
            id: `${CONTENT}map-file`,
            label: fileName(scene.map.asset.path),
            mono: true,
          },
          {
            id: `${CONTENT}levels`,
            label: t("shell.browser.levels"),
            icon: <Layers />,
            children: (map?.levels ?? []).map((level) => {
              // The level's rooms (T-108c1), drawn in the Map Forge for every scene of the map.
              const rooms = map
                ? areasOnLevel(map.areas, map.levels, level.id)
                : [];
              return {
                id: `${CONTENT}level-${level.id}`,
                label: level.name,
                meta: levelMeta(level.id),
                ...(rooms.length > 0 && {
                  children: rooms.map((room) => ({
                    id: `${CONTENT}room-${room.id}`,
                    label: room.name,
                    icon: <DoorOpen />,
                    ...(room.secret === true && {
                      meta: t("forgeRooms.secretMeta"),
                    }),
                  })),
                }),
              };
            }),
          },
        ],
      }
    : {
        id: `${CONTENT}map`,
        label: t("shell.browser.noMap"),
        icon: <MapIcon />,
      };
  const fog: TreeNode = {
    id: `${CONTENT}fog`,
    label: t("shell.browser.fog"),
    icon: <Cloud />,
    meta: t("shell.browser.fogAreas", { count: revealed.length }),
  };
  return [mapNode, fog];
}
