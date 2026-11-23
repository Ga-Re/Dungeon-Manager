import type { ResolvedMap } from "@dungeon-manager/core";
import type { Scene } from "@dungeon-manager/schema";
import { createI18n, type TreeNode } from "@dungeon-manager/ui";
import { render } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { sceneContentNodes } from "./scene-tree.js";

const i18n = createI18n("de");
const hash = `sha256:${"a".repeat(64)}`;

const asset = { path: "library/maps/turm.png", hash };

const scene = (levels: number, table?: Scene["table"]) => ({
  scene: {
    schemaVersion: 3,
    id: "s",
    name: "Turm",
    map: { kind: "image", asset, overrides: {} },
    tokens: [],
    fog: { levels: {} },
    initiative: null,
    ...(table && { table }),
  } satisfies Scene,
  // The scene's map as resolved from its sidecar (ADR-0012).
  map: {
    kind: "image",
    asset,
    grid: { cellSizePx: 100, offsetXPx: 0, offsetYPx: 0 },
    levels: [
      { id: "ground", name: "Erdgeschoss" },
      { id: "cellar", name: "Keller" },
      { id: "roof", name: "Dach" },
    ].slice(0, levels),
    areas: [],
  } satisfies ResolvedMap,
});

/** The marker text of each level row (T-118c). */
function marks(of: ReturnType<typeof scene>): Record<string, string> {
  const [map] = sceneContentNodes(i18n.t, of.scene, of.map, []);
  const levels = map?.children?.find((node) => node.id.endsWith("levels"));
  return Object.fromEntries(
    (levels?.children ?? []).map((node: TreeNode) => [
      node.label,
      render(<>{node.meta}</>).container.textContent,
    ]),
  );
}

describe("level markers in the scene browser", () => {
  test("without `table` the first level is on the TV", () => {
    expect(marks(scene(3))).toEqual({
      Erdgeschoss: "auf dem TV",
      Keller: "",
      Dach: "",
    });
  });

  test("marks nothing while the map has one level", () => {
    expect(marks(scene(1))).toEqual({ Erdgeschoss: "" });
  });

  test("marks the TV's level and the released ones; unknown ids are ignored", () => {
    expect(
      marks(
        scene(3, {
          levelId: "cellar",
          shownLevelIds: ["ground", "cellar", "gone"],
        }),
      ),
    ).toEqual({ Erdgeschoss: "freigegeben", Keller: "auf dem TV", Dach: "" });
  });
});
