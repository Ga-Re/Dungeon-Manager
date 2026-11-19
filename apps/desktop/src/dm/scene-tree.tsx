import type { Polygon, Scene } from "@dungeon-manager/schema";
import type { TreeNode } from "@dungeon-manager/ui";
import type { TFunction } from "i18next";
import { Cloud, Layers, Map as MapIcon } from "lucide-react";
import { fileName } from "./file-name.js";

/** Tree ids of the open scene's content, kept apart from scene ids (`scene:<id>`). */
const CONTENT = "content:";

/**
 * The open scene's content in the scene browser (ADR-0011): its map with levels and its fog.
 * Grows with tokens, rooms and notes in later tasks.
 */
export function sceneContentNodes(
  t: TFunction,
  scene: Scene,
  revealed: readonly Polygon[],
): TreeNode[] {
  const map: TreeNode = scene.map
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
            children: scene.map.levels.map((level) => ({
              id: `${CONTENT}level-${level.id}`,
              label: level.name,
            })),
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
  return [map, fog];
}
