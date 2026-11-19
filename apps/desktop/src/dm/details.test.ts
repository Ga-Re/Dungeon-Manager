import type { Scene } from "@dungeon-manager/schema";
import { createI18n } from "@dungeon-manager/ui";
import { describe, expect, it } from "vitest";
import { describeItem, type DetailsData } from "./details.js";

const t = createI18n("de").t;

const scene = (id: string, name: string): Scene => ({
  schemaVersion: 1,
  id,
  name,
  map: null,
  tokens: [],
  fog: { levels: {} },
  initiative: null,
});

const data: DetailsData = {
  name: "Fluch der Krypta",
  scenes: [
    { id: "a", scene: scene("a", "Krypta"), problem: null },
    { id: "b", scene: null, problem: "invalid" },
  ],
  sessions: [
    {
      id: "s1",
      session: {
        schemaVersion: 1,
        id: "s1",
        name: "Session 1",
        date: "2026-11-28",
        sceneIds: ["a", "gone"],
      },
      problem: null,
    },
  ],
  players: [],
  mapPaths: [],
  visibilityRules: 0,
  live: null,
  openSceneId: null,
  language: "de",
};

const rows = (id: string) =>
  Object.fromEntries(
    (describeItem(t, id, data)?.rows ?? []).map((row) => [
      row.label,
      row.value,
    ]),
  );

describe("describeItem", () => {
  it("describes a session with its date, scene count and missing scenes", () => {
    expect(describeItem(t, "session:s1", data)?.name).toBe("Session 1");
    expect(rows("session:s1")).toMatchObject({
      Datum: "28. Nov. 2026",
      Szenen: "2",
      "Fehlende Szenen": "gone",
    });
  });

  it("names the sessions a scene is in, or Ohne Session", () => {
    expect(rows("scene:s1/a")["Sessions"]).toBe("Session 1");
    expect(
      describeItem(t, "scene:-/a", { ...data, sessions: [] })?.rows.find(
        (row) => row.label === "Sessions",
      )?.value,
    ).toBe("Ohne Session");
  });

  it("counts sessions on the campaign and has nothing for unreadable scenes and groups", () => {
    expect(rows("campaign")).toMatchObject({ Sessions: "1", Szenen: "2" });
    expect(describeItem(t, "scene:-/b", data)).toBeNull();
    expect(describeItem(t, "group:notes", data)).toBeNull();
    expect(describeItem(t, "missing:s1/gone", data)).toBeNull();
  });
});
