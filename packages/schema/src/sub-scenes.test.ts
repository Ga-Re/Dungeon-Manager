import { describe, expect, it } from "vitest";
import { sceneSchema } from "./documents.js";

const scene = {
  schemaVersion: 2,
  id: "kammer",
  name: "Geheimkammer",
  map: null,
  tokens: [],
  fog: { levels: {} },
  initiative: null,
};

describe("sub-scenes (T-152)", () => {
  it("a scene may name its parent scene; scenes without one stay valid", () => {
    expect(sceneSchema.safeParse(scene).success).toBe(true);
    const parsed = sceneSchema.parse({ ...scene, parentSceneId: "krypta" });
    expect(parsed.parentSceneId).toBe("krypta");
  });

  it("rejects an unsafe id, but keeps a scene that names itself readable", () => {
    expect(
      sceneSchema.safeParse({ ...scene, parentSceneId: "../krypta" }).success,
    ).toBe(false);
    // A loop (DM decision): the browser shows such a scene at the top level.
    expect(
      sceneSchema.safeParse({ ...scene, parentSceneId: "kammer" }).success,
    ).toBe(true);
  });
});
