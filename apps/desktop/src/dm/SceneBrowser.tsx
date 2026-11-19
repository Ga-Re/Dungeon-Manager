import type { Polygon, Scene } from "@dungeon-manager/schema";
import { FloatingPanel, TreeList, type TreeNode } from "@dungeon-manager/ui";
import { Cloud, Layers, Map as MapIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { fileName } from "./file-name.js";

/**
 * Floating scene browser (top left over the map, ADR-0011): the open scene as a tree. It grows
 * with tokens, rooms and notes in later tasks.
 */
export function SceneBrowser({
  scene,
  revealed,
}: {
  readonly scene: Scene;
  /** Revealed fog areas of the shown level. */
  readonly revealed: readonly Polygon[];
}) {
  const { t } = useTranslation();
  const map: TreeNode = scene.map
    ? {
        id: "map",
        label: t("shell.browser.map"),
        icon: <MapIcon />,
        children: [
          {
            id: "map-file",
            label: fileName(scene.map.asset.path),
            mono: true,
          },
          {
            id: "levels",
            label: t("shell.browser.levels"),
            icon: <Layers />,
            children: scene.map.levels.map((level) => ({
              id: `level-${level.id}`,
              label: level.name,
            })),
          },
        ],
      }
    : { id: "map", label: t("shell.browser.noMap"), icon: <MapIcon /> };
  const fog: TreeNode = {
    id: "fog",
    label: t("shell.browser.fog"),
    icon: <Cloud />,
    meta: t("shell.browser.fogAreas", { count: revealed.length }),
  };
  return (
    <FloatingPanel title={t("shell.browser.title")} compact>
      <TreeList
        label={t("shell.browser.title")}
        nodes={[{ id: "scene", label: scene.name, children: [map, fog] }]}
      />
    </FloatingPanel>
  );
}
