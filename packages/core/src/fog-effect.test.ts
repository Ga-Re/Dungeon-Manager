import { describe, expect, test } from "vitest";
import {
  apply,
  effectiveFogEffect,
  projectForViewer,
  type ApplyResult,
} from "./index.js";
import { caveMap, ctx, scene, sessionOf } from "./test-data.test-data.js";

// Fog biomes (T-168): the map's default, the scene's live choice, and what the TV gets.

function ok(result: ApplyResult) {
  if (!result.ok) throw new Error(result.reason);
  return result;
}

const table = { kind: "table" } as const;
const snow = { biome: "schnee", strength: 0.7 };
const ash = { biome: "asche", strength: 1 };

describe("effectiveFogEffect", () => {
  test("the scene's choice wins over the map's; neither means none", () => {
    expect(effectiveFogEffect(sessionOf(scene))).toBeNull();
    const onMap = sessionOf(scene, undefined, { ...caveMap, fogEffect: snow });
    expect(effectiveFogEffect(onMap)).toEqual(snow);
    const chosen = sessionOf({ ...scene, fogEffect: ash }, undefined, {
      ...caveMap,
      fogEffect: snow,
    });
    expect(effectiveFogEffect(chosen)).toEqual(ash);
  });
});

describe("scene.setFogEffect", () => {
  test("sets, clears and keeps the scene's live choice", () => {
    const state = sessionOf(scene);
    const set = ok(
      apply(state, { type: "scene.setFogEffect", fogEffect: snow }, ctx),
    );
    expect(set.state.scene.fogEffect).toEqual(snow);
    expect(set.events).toEqual([
      expect.objectContaining({ type: "fogEffect.changed" }),
    ]);
    const same = ok(
      apply(set.state, { type: "scene.setFogEffect", fogEffect: snow }, ctx),
    );
    expect(same.state).toBe(set.state);
    const cleared = ok(
      apply(set.state, { type: "scene.setFogEffect", fogEffect: null }, ctx),
    );
    expect("fogEffect" in cleared.state.scene).toBe(false);
  });
});

describe("scene.setFogEffect checks the strength", () => {
  test("rejects a strength outside 0…1 or not a number", () => {
    for (const strength of [-0.1, 1.5, Number.NaN])
      expect(
        apply(
          sessionOf(scene),
          {
            type: "scene.setFogEffect",
            fogEffect: { biome: "schnee", strength },
          },
          ctx,
        ),
      ).toEqual({ ok: false, reason: "invalidAmount" });
  });
});

describe("projection of the fog effect", () => {
  test("the TV gets a known biome with its strength", () => {
    const state = sessionOf({ ...scene, fogEffect: snow });
    expect(projectForViewer(state, table).fogEffect).toEqual(snow);
  });

  test("an unknown biome (a newer app's) and no effect reach no viewer", () => {
    expect(projectForViewer(sessionOf(scene), table).fogEffect).toBeUndefined();
    const unknown = sessionOf({
      ...scene,
      fogEffect: { biome: "vulkan2", strength: 1 },
    });
    expect(projectForViewer(unknown, table).fogEffect).toBeUndefined();
  });

  test("unknown fields of the effect never reach a viewer", () => {
    const extra = sessionOf({
      ...scene,
      fogEffect: { biome: "arkan", strength: 0.5, secret: "x" },
    });
    expect(projectForViewer(extra, table).fogEffect).toEqual({
      biome: "arkan",
      strength: 0.5,
    });
  });
});
